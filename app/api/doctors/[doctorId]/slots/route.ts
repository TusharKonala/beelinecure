import { prisma } from "@/lib/db";
import { publicDoctorByIdWhere } from "@/lib/doctor-visibility";
import {
  coerceAllowedSlotDurationMinutes,
  expandAvailabilityRowsDetailed,
  inferSlotDurationMinutesFromRows,
  slotSupportsPatientConsultationChoice,
  type PatientConsultationChoice,
} from "@/lib/doctor-availability-slots";
import {
  doctorDateRangeCoveringPatientRange,
  doctorSlotToPatientLocalYmd,
  isDoctorTimeInPast,
  isValidIanaTimeZone,
} from "@/lib/timezone-display";
import { NextRequest, NextResponse } from "next/server";
import { AppointmentStatus } from "@/generated/prisma/client";
import { activeBookingSessionHoldsByDate } from "@/lib/slot-availability";

function parseYmdUtc(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dateKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type SlotDetailRow = {
  doctorDate: string;
  startTime: string;
  slotDurationMinutes: number;
  consultationType: "CLINIC" | "ONLINE" | "BOTH";
  availabilityId: string | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> },
) {
  const { doctorId } = await params;
  const dateParam = request.nextUrl.searchParams.get("date");
  const patientDateParam = request.nextUrl.searchParams.get("patientDate");
  const patientTimezoneParam = request.nextUrl.searchParams.get("patientTimezone");
  const excludeAppointmentId = request.nextUrl.searchParams.get(
    "excludeAppointmentId",
  );
  const choiceParam = request.nextUrl.searchParams.get("consultationType");
  let consultationFilter: PatientConsultationChoice | null = null;
  if (choiceParam !== null && choiceParam !== "") {
    if (choiceParam !== "CLINIC" && choiceParam !== "ONLINE") {
      return NextResponse.json(
        { error: "consultationType must be CLINIC or ONLINE" },
        { status: 400 },
      );
    }
    consultationFilter = choiceParam;
  }

  const hasDoctorDate = dateParam !== null && dateParam !== "";
  const hasPatientDate =
    patientDateParam !== null && patientDateParam !== "";
  const hasPatientTimezone =
    patientTimezoneParam !== null && patientTimezoneParam.trim() !== "";

  if (hasDoctorDate && (hasPatientDate || hasPatientTimezone)) {
    return NextResponse.json(
      { error: "Use either date or patientDate+patientTimezone, not both" },
      { status: 400 },
    );
  }
  if (hasPatientDate !== hasPatientTimezone) {
    return NextResponse.json(
      { error: "patientDate and patientTimezone must both be provided" },
      { status: 400 },
    );
  }
  if (!hasDoctorDate && !hasPatientDate) {
    return NextResponse.json(
      { error: "date or patientDate is required" },
      { status: 400 },
    );
  }

  const patientTimezone = hasPatientTimezone
    ? patientTimezoneParam!.trim()
    : null;
  if (patientTimezone && !isValidIanaTimeZone(patientTimezone)) {
    return NextResponse.json(
      { error: "Invalid patientTimezone" },
      { status: 400 },
    );
  }

  const doctor = await prisma.doctor.findFirst({
    where: publicDoctorByIdWhere(doctorId),
    select: { timezone: true, slotDurationMinutes: true },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const fallback = coerceAllowedSlotDurationMinutes(doctor.slotDurationMinutes);
  const doctorTz = doctor.timezone;

  let queryRangeStart: Date;
  let queryRangeEnd: Date;
  let patientDateFilter: string | null = null;

  if (hasDoctorDate) {
    const date = parseYmdUtc(dateParam!);
    if (!date) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (date < today) {
      return NextResponse.json(
        { error: "Cannot fetch slots for past dates" },
        { status: 400 },
      );
    }
    queryRangeStart = date;
    queryRangeEnd = date;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patientDateParam!)) {
      return NextResponse.json({ error: "Invalid patientDate" }, { status: 400 });
    }
    patientDateFilter = patientDateParam!;
    const doctorRange = doctorDateRangeCoveringPatientRange(
      patientDateFilter,
      patientDateFilter,
      patientTimezone!,
      doctorTz,
    );
    const rangeStart = parseYmdUtc(doctorRange.min);
    const rangeEnd = parseYmdUtc(doctorRange.max);
    if (!rangeStart || !rangeEnd) {
      return NextResponse.json({ error: "Invalid patientDate" }, { status: 400 });
    }
    queryRangeStart = rangeStart;
    queryRangeEnd = rangeEnd;
  }

  const [availabilities, appointments, sessionHoldsByDay] = await Promise.all([
    prisma.doctorAvailability.findMany({
      where: {
        doctorId,
        date: { gte: queryRangeStart, lte: queryRangeEnd },
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        slotDurationMinutes: true,
        consultationType: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        doctorId,
        date: { gte: queryRangeStart, lte: queryRangeEnd },
        status: { not: AppointmentStatus.CANCELLED },
        ...(excludeAppointmentId
          ? { id: { not: excludeAppointmentId } }
          : {}),
      },
      select: { date: true, time: true },
    }),
    activeBookingSessionHoldsByDate({
      doctorId,
      rangeStart: queryRangeStart,
      rangeEnd: queryRangeEnd,
    }),
  ]);

  const bookedByDay = new Map<string, Set<string>>();
  for (const appt of appointments) {
    const key = dateKeyUtc(appt.date);
    if (!bookedByDay.has(key)) bookedByDay.set(key, new Set());
    bookedByDay.get(key)!.add(appt.time);
  }

  for (const [dayKey, heldTimes] of sessionHoldsByDay) {
    if (!bookedByDay.has(dayKey)) bookedByDay.set(dayKey, new Set());
    for (const t of heldTimes) {
      bookedByDay.get(dayKey)!.add(t);
    }
  }

  const rowsByDay = new Map<
    string,
    {
      id: string;
      startTime: string;
      endTime: string;
      slotDurationMinutes: number;
      consultationType: "CLINIC" | "ONLINE" | "BOTH";
    }[]
  >();

  for (const row of availabilities) {
    const key = dateKeyUtc(row.date);
    const mapped = {
      id: row.id,
      startTime: row.startTime,
      endTime: row.endTime,
      slotDurationMinutes: row.slotDurationMinutes,
      consultationType: row.consultationType,
    };
    const list = rowsByDay.get(key);
    if (list) list.push(mapped);
    else rowsByDay.set(key, [mapped]);
  }

  const allSlotDetails: SlotDetailRow[] = [];

  for (const [dayKey, rows] of rowsByDay) {
    let slotDetails = expandAvailabilityRowsDetailed(rows, fallback);
    if (consultationFilter) {
      slotDetails = slotDetails.filter((d) =>
        slotSupportsPatientConsultationChoice(
          d.consultationType,
          consultationFilter,
        ),
      );
    }
    const booked = bookedByDay.get(dayKey) ?? new Set<string>();
    for (const detail of slotDetails) {
      if (booked.has(detail.startTime)) continue;
      if (isDoctorTimeInPast(dayKey, detail.startTime, doctorTz)) continue;
      if (patientDateFilter) {
        const patientYmd = doctorSlotToPatientLocalYmd(
          dayKey,
          detail.startTime,
          doctorTz,
          patientTimezone!,
        );
        if (patientYmd !== patientDateFilter) continue;
      }
      allSlotDetails.push({
        doctorDate: dayKey,
        startTime: detail.startTime,
        slotDurationMinutes: detail.slotDurationMinutes,
        consultationType: detail.consultationType,
        availabilityId: detail.availabilityId,
      });
    }
  }

  allSlotDetails.sort((a, b) =>
    a.doctorDate === b.doctorDate
      ? a.startTime.localeCompare(b.startTime)
      : a.doctorDate.localeCompare(b.doctorDate),
  );

  const available = allSlotDetails.map((d) => d.startTime);
  const slotDurationMinutes = consultationFilter
    ? inferSlotDurationMinutesFromRows(
        allSlotDetails.map((d) => ({
          startTime: d.startTime,
          endTime: d.startTime,
          slotDurationMinutes: d.slotDurationMinutes,
        })),
        fallback,
      )
    : inferSlotDurationMinutesFromRows(
        availabilities.map((a) => ({
          startTime: a.startTime,
          endTime: a.endTime,
          slotDurationMinutes: a.slotDurationMinutes,
        })),
        fallback,
      );

  return NextResponse.json({
    slots: available,
    slotDetails: allSlotDetails,
    doctorTimezone: doctorTz,
    slotDurationMinutes,
  });
}
