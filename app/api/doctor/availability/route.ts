import {
  AppointmentStatus,
  ConsultationType,
  UserRole,
} from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { cancelAppointmentByDoctor } from "@/lib/doctor-cancellations";
import { prisma } from "@/lib/db";
import {
  coerceAllowedSlotDurationMinutes,
  expandAvailabilityRowsDetailed,
  inferSlotDurationMinutesFromRows,
  isValidSlotStartForDuration,
  slotEndFromStart,
  slotOverlapsRange,
} from "@/lib/doctor-availability-slots";
import {
  enumerateInclusiveYmd,
  getDoctorLocalTodayIso,
  MAX_DOCTOR_AVAILABILITY_RANGE_DAYS,
  ymdToPrismaDate,
} from "@/lib/doctor-local-date";
import { timeToMinutes } from "@/lib/time";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getEmailFrom } from "@/lib/email-from";
import { z } from "zod";
import {
  formatDateInDoctorTz,
  formatTimeInDoctorTz,
} from "@/lib/timezone-display";
import {
  DoctorHolidaySummaryEmailTemplate,
  type DoctorHolidaySummaryItem,
} from "@/components/doctor-holiday-summary-email-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const durationSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal(60),
]);

const consultationTypeSchema = z.enum(["CLINIC", "ONLINE", "BOTH"]);

function parseYmdOrNull(s: string | null): string | null {
  if (!s?.trim()) return null;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(t + "T12:00:00.000Z");
  if (Number.isNaN(d.getTime())) return null;
  return t;
}

function slotsOverlap(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number,
): boolean {
  return startA < startB + durationB && startB < startA + durationA;
}

function isAvailabilitySaveTimeoutError(error: unknown): boolean {
  if (error instanceof PrismaClientKnownRequestError && error.code === "P2028") {
    return true;
  }
  if (error instanceof Error && /timeout/i.test(error.message)) {
    return true;
  }
  return false;
}

type MergedAvailabilitySlot = {
  startTime: string;
  slotDurationMinutes: number;
  consultationType: "CLINIC" | "ONLINE" | "BOTH";
};

function mergeAvailabilitySlotsForDay(args: {
  existingRows: Array<{
    startTime: string;
    slotDurationMinutes: number;
    consultationType: "CLINIC" | "ONLINE" | "BOTH";
  }>;
  mode: "range" | "single";
  slotStarts: string[];
  newSlots: string[];
  removedSlots: string[];
  perSlotDuration: Record<string, number>;
  perSlotConsultation: Record<string, "CLINIC" | "ONLINE" | "BOTH">;
  duration: number;
  defaultConsultationType: "CLINIC" | "ONLINE" | "BOTH";
  bookedTimesForDay: Set<string>;
}): MergedAvailabilitySlot[] {
  const {
    existingRows,
    mode,
    slotStarts,
    newSlots,
    removedSlots,
    perSlotDuration,
    perSlotConsultation,
    duration,
    defaultConsultationType,
    bookedTimesForDay,
  } = args;

  const merged = new Map<string, MergedAvailabilitySlot>();
  for (const row of existingRows) {
    merged.set(row.startTime, {
      startTime: row.startTime,
      slotDurationMinutes: row.slotDurationMinutes,
      consultationType: row.consultationType,
    });
  }

  // Keep existing semantics identical: single-day incremental edits delete/add
  // only the changed slots; range saves and single-day full replacements
  // write the full `slotStarts` list.
  if (mode === "single" && (newSlots.length > 0 || removedSlots.length > 0)) {
    for (const startTime of removedSlots) {
      merged.delete(startTime);
    }
    for (const startTime of newSlots) {
      merged.set(startTime, {
        startTime,
        slotDurationMinutes: perSlotDuration[startTime] ?? duration,
        consultationType:
          perSlotConsultation[startTime] ?? defaultConsultationType,
      });
    }
  } else {
    for (const startTime of slotStarts) {
      merged.set(startTime, {
        startTime,
        slotDurationMinutes: perSlotDuration[startTime] ?? duration,
        consultationType:
          perSlotConsultation[startTime] ?? defaultConsultationType,
      });
    }
  }

  const newSlotSet = new Set(
    mode === "single" && (newSlots.length > 0 || removedSlots.length > 0)
      ? newSlots
      : slotStarts,
  );

  // Overlap pruning only applies to keys *not* in the new slot set
  // (range saves effectively skip it because newSlotSet covers slotStarts).
  for (const newStart of newSlotSet) {
    const newEntry = merged.get(newStart);
    if (!newEntry) continue;

    const newStartMin = timeToMinutes(newStart);
    for (const [key, entry] of merged) {
      if (key === newStart) continue;
      if (newSlotSet.has(key)) continue;
      if (bookedTimesForDay.has(key)) continue;

      const existStartMin = timeToMinutes(key);
      if (
        slotsOverlap(
          newStartMin,
          newEntry.slotDurationMinutes,
          existStartMin,
          entry.slotDurationMinutes,
        )
      ) {
        merged.delete(key);
      }
    }
  }

  return [...merged.values()];
}

function toDoctorAvailabilityCreateRows(args: {
  doctorId: string;
  date: Date;
  mergedSlots: MergedAvailabilitySlot[];
}): Array<{
  doctorId: string;
  date: Date;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  consultationType: "CLINIC" | "ONLINE" | "BOTH";
}> {
  const { doctorId, date, mergedSlots } = args;
  return mergedSlots.map((row) => ({
    doctorId,
    date,
    startTime: row.startTime,
    endTime: slotEndFromStart(row.startTime, row.slotDurationMinutes),
    slotDurationMinutes: row.slotDurationMinutes,
    consultationType: row.consultationType,
  }));
}

const putBodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("range"),
    startDate: ymd,
    endDate: ymd,
    slotStarts: z.array(z.string()),
    newSlots: z.array(z.string()).optional(),
    removedSlots: z.array(z.string()).optional(),
    slotDurationMinutes: durationSchema.optional(),
    slotDurationMap: z.record(z.string(), durationSchema).optional(),
    consultationType: consultationTypeSchema.optional(),
    consultationTypeMap: z
      .record(z.string(), consultationTypeSchema)
      .optional(),
    /**
     * Explicitly clear the day(s) — delete all availability rows and cancel any
     * active appointments. Required to wipe a day; an empty `slotStarts` array
     * without this flag is rejected so accidental empty saves never destroy
     * data.
     */
    clearDay: z.boolean().optional().default(false),
  }),
  z.object({
    mode: z.literal("single"),
    singleDate: ymd,
    slotStarts: z.array(z.string()),
    newSlots: z.array(z.string()).optional(),
    removedSlots: z.array(z.string()).optional(),
    slotDurationMinutes: durationSchema.optional(),
    slotDurationMap: z.record(z.string(), durationSchema).optional(),
    consultationType: consultationTypeSchema.optional(),
    consultationTypeMap: z
      .record(z.string(), consultationTypeSchema)
      .optional(),
    clearDay: z.boolean().optional().default(false),
  }),
]);

const patchBodySchema = z.object({
  slotDurationMinutes: durationSchema,
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.DOCTOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const doctor = await prisma.doctor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, timezone: true, slotDurationMinutes: true },
  });
  if (!doctor) {
    return NextResponse.json(
      { error: "Doctor profile not found" },
      { status: 404 },
    );
  }

  const tz = doctor.timezone;
  const today = getDoctorLocalTodayIso(tz);
  const fallbackDuration = coerceAllowedSlotDurationMinutes(
    doctor.slotDurationMinutes,
  );

  const view = request.nextUrl.searchParams.get("view");
  if (view === "dates") {
    const rows = await prisma.doctorAvailability.findMany({
      where: {
        doctorId: doctor.id,
        date: { gte: ymdToPrismaDate(today) },
      },
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "asc" },
    });

    return NextResponse.json({
      timezone: tz,
      today,
      dates: rows.map((row) => row.date.toISOString().slice(0, 10)),
    });
  }

  if (view === "list") {
    const monthParamRaw = request.nextUrl.searchParams.get("month")?.trim();
    let monthFilterYm: string | null = null;
    if (monthParamRaw) {
      if (!/^\d{4}-\d{2}$/.test(monthParamRaw)) {
        return NextResponse.json({ error: "Invalid month" }, { status: 400 });
      }
      monthFilterYm = monthParamRaw;
    }
    /**
     * When true, the response is narrowed to days that have at least one
     * booked slot. Done server-side (before pagination) so `hasMore` reflects
     * the filtered dataset and the client's infinite scroll terminates at the
     * correct page.
     */
    const bookedOnly =
      request.nextUrl.searchParams.get("bookedOnly") === "true";
    const page = Math.max(
      1,
      Number(request.nextUrl.searchParams.get("page") ?? "1") || 1,
    );
    const limit = Math.min(
      20,
      Math.max(
        1,
        Number(request.nextUrl.searchParams.get("limit") ?? "10") || 10,
      ),
    );
    const rows = await prisma.doctorAvailability.findMany({
      where: {
        doctorId: doctor.id,
        date: { gte: ymdToPrismaDate(today) },
      },
      select: {
        date: true,
        startTime: true,
        endTime: true,
        slotDurationMinutes: true,
        consultationType: true,
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    const upcomingAppointments = await prisma.appointment.findMany({
      where: {
        doctorId: doctor.id,
        date: { gte: ymdToPrismaDate(today) },
        status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
      },
      select: { date: true, time: true },
    });
    const bookedByDate = new Map<string, Set<string>>();
    for (const appt of upcomingAppointments) {
      const dateKey = appt.date.toISOString().slice(0, 10);
      const daySet = bookedByDate.get(dateKey) ?? new Set<string>();
      daySet.add(appt.time);
      bookedByDate.set(dateKey, daySet);
    }

    const byDate = new Map<
      string,
      {
        startTime: string;
        endTime: string;
        slotDurationMinutes: number;
        consultationType: "CLINIC" | "ONLINE" | "BOTH";
      }[]
    >();
    for (const r of rows) {
      const key = r.date.toISOString().slice(0, 10);
      const list = byDate.get(key) ?? [];
      list.push({
        startTime: r.startTime,
        endTime: r.endTime,
        slotDurationMinutes: r.slotDurationMinutes,
        consultationType: r.consultationType,
      });
      byDate.set(key, list);
    }

    const days: {
      date: string;
      slotStarts: string[];
      slotDetails: {
        startTime: string;
        slotDurationMinutes: number;
        consultationType: "CLINIC" | "ONLINE" | "BOTH";
        booked: boolean;
      }[];
    }[] = [];
    for (const [dateStr, windows] of byDate) {
      const details = expandAvailabilityRowsDetailed(windows, fallbackDuration);
      if (details.length === 0) continue;
      const booked = bookedByDate.get(dateStr) ?? new Set<string>();
      const slotDetails = details.map((slot) => ({
        startTime: slot.startTime,
        slotDurationMinutes: slot.slotDurationMinutes,
        consultationType: slot.consultationType,
        booked: booked.has(slot.startTime),
      }));
      days.push({
        date: dateStr,
        slotStarts: slotDetails.map((slot) => slot.startTime),
        slotDetails,
      });
    }
    days.sort((a, b) => a.date.localeCompare(b.date));

    const monthKeys = new Set<string>();
    const datesByMonth: Record<string, string[]> = {};
    for (const d of days) {
      const ym = d.date.slice(0, 7);
      monthKeys.add(ym);
      const bucket = datesByMonth[ym] ?? [];
      bucket.push(d.date);
      datesByMonth[ym] = bucket;
    }
    for (const key of Object.keys(datesByMonth)) {
      datesByMonth[key] = [...datesByMonth[key]!].sort();
    }
    const monthsWithAvailability = [...monthKeys].sort();

    let daysWindow = days;
    if (monthFilterYm) {
      daysWindow = daysWindow.filter(
        (d) => d.date.slice(0, 7) === monthFilterYm,
      );
    }
    if (bookedOnly) {
      daysWindow = daysWindow.filter((d) =>
        d.slotDetails.some((slot) => slot.booked),
      );
    }

    const start = (page - 1) * limit;
    const paginatedDays = daysWindow.slice(start, start + limit);

    return NextResponse.json({
      timezone: tz,
      today,
      slotDurationMinutes: fallbackDuration,
      days: paginatedDays,
      hasMore: start + limit < daysWindow.length,
      total: daysWindow.length,
      page,
      monthsWithAvailability,
      datesByMonth,
    });
  }

  const dateParam = parseYmdOrNull(request.nextUrl.searchParams.get("date"));
  if (dateParam === null && request.nextUrl.searchParams.has("date")) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  if (!dateParam) {
    return NextResponse.json({
      timezone: tz,
      today,
      slotDurationMinutes: fallbackDuration,
    });
  }

  if (dateParam < today) {
    return NextResponse.json(
      { error: "Cannot load availability for past dates" },
      { status: 400 },
    );
  }

  const rows = await prisma.doctorAvailability.findMany({
    where: { doctorId: doctor.id, date: ymdToPrismaDate(dateParam) },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      slotDurationMinutes: true,
      consultationType: true,
    },
  });
  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      date: ymdToPrismaDate(dateParam),
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
    },
    select: { time: true, consultationType: true, durationMinutes: true },
  });

  const slotDurationMinutes = inferSlotDurationMinutesFromRows(
    rows,
    fallbackDuration,
  );
  const expandedSlots = expandAvailabilityRowsDetailed(rows, fallbackDuration);
  const slotStarts = expandedSlots.map((slot) => slot.startTime);
  const consultationType = rows[0]?.consultationType ?? "BOTH";

  /** Map booked start times → how the appointment was booked (video vs clinic). */
  const appointmentsByTime = new Map<string, { consultationType: ConsultationType; durationMinutes: number }>();
  for (const a of appointments) {
    appointmentsByTime.set(a.time, { consultationType: a.consultationType, durationMinutes: a.durationMinutes });
  }

  const seenTimes = new Set<string>();
  const slotDetailsWithBooked: {
    startTime: string;
    slotDurationMinutes: number;
    consultationType: ConsultationType | "BOTH";
    booked: boolean;
  }[] = [];

  for (const slot of expandedSlots) {
    const appt = appointmentsByTime.get(slot.startTime);
    const booked = appt !== undefined;
    slotDetailsWithBooked.push({
      startTime: slot.startTime,
      slotDurationMinutes: slot.slotDurationMinutes,
      consultationType: booked ? appt.consultationType : slot.consultationType,
      booked,
    });
    seenTimes.add(slot.startTime);
  }

  /** Appointments on times with no persisted availability row (edge case). */
  for (const a of appointments) {
    if (seenTimes.has(a.time)) continue;
    slotDetailsWithBooked.push({
      startTime: a.time,
      slotDurationMinutes: a.durationMinutes || slotDurationMinutes,
      consultationType: a.consultationType,
      booked: true,
    });
    seenTimes.add(a.time);
  }

  slotDetailsWithBooked.sort((x, y) =>
    x.startTime.localeCompare(y.startTime, undefined, { numeric: true }),
  );

  return NextResponse.json({
    timezone: tz,
    today,
    slotDurationMinutes,
    slotStarts,
    slotDetails: slotDetailsWithBooked,
    consultationType,
    bookedSlotStarts: appointments.map((appointment) => appointment.time).sort(),
    bookedAppointmentsByType: {
      inClinic: appointments.filter(
        (appointment) => appointment.consultationType === "CLINIC",
      ).length,
      online: appointments.filter(
        (appointment) => appointment.consultationType === "ONLINE",
      ).length,
    },
  });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.DOCTOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed: z.infer<typeof patchBodySchema>;
  try {
    const json: unknown = await request.json();
    parsed = patchBodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const doctor = await prisma.doctor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, isActive: true },
  });
  if (!doctor) {
    return NextResponse.json(
      { error: "Doctor profile not found" },
      { status: 404 },
    );
  }
  if (!doctor.isActive) {
    return NextResponse.json(
      {
        error:
          "Account deactivated. New availability cannot be accepted while your account is inactive.",
      },
      { status: 403 },
    );
  }

  await prisma.doctor.update({
    where: { id: doctor.id },
    data: { slotDurationMinutes: parsed.slotDurationMinutes },
  });

  return NextResponse.json({
    ok: true,
    slotDurationMinutes: parsed.slotDurationMinutes,
  });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.DOCTOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const doctor = await prisma.doctor.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      timezone: true,
      slotDurationMinutes: true,
      isActive: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });
  if (!doctor) {
    return NextResponse.json(
      { error: "Doctor profile not found" },
      { status: 404 },
    );
  }
  if (!doctor.isActive) {
    return NextResponse.json(
      {
        error:
          "Account deactivated. New availability cannot be accepted while your account is inactive.",
      },
      { status: 403 },
    );
  }

  let parsed: z.infer<typeof putBodySchema>;
  try {
    const json: unknown = await request.json();
    parsed = putBodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const tz = doctor.timezone;
  const today = getDoctorLocalTodayIso(tz);
  const duration =
    parsed.slotDurationMinutes ??
    coerceAllowedSlotDurationMinutes(doctor.slotDurationMinutes);
  const perSlotDuration: Record<string, number> = parsed.slotDurationMap ?? {};
  const perSlotConsultation: Record<string, "CLINIC" | "ONLINE" | "BOTH"> =
    parsed.consultationTypeMap ?? {};
  const defaultConsultationType = parsed.consultationType ?? "BOTH";
  const clearDay = parsed.clearDay ?? false;

  const slotStarts = [...new Set(parsed.slotStarts)];
  const newSlots = [...new Set(parsed.newSlots ?? [])];
  const removedSlots = [...new Set(parsed.removedSlots ?? [])];

  if (clearDay && slotStarts.length > 0) {
    return NextResponse.json(
      {
        error:
          "clearDay cannot be used together with slotStarts. Send clearDay:true with an empty slotStarts to wipe the day.",
      },
      { status: 400 },
    );
  }

  if (!clearDay && slotStarts.length === 0) {
    return NextResponse.json(
      {
        error:
          "No slots provided. Set clearDay:true to mark the day as a holiday.",
      },
      { status: 400 },
    );
  }

  for (const s of [...slotStarts, ...newSlots]) {
    const slotDur = perSlotDuration[s] ?? duration;
    if (!isValidSlotStartForDuration(s, slotDur)) {
      return NextResponse.json(
        {
          error: `Slot ${s} must align to a ${slotDur}-minute schedule (valid start times for this duration).`,
        },
        { status: 400 },
      );
    }
  }
  for (const s of removedSlots) {
    if (!/^\d{2}:\d{2}$/.test(s)) {
      return NextResponse.json(
        { error: `Invalid time format for removed slot: ${s}` },
        { status: 400 },
      );
    }
  }
  slotStarts.sort();

  let affectedYmd: string[];
  if (parsed.mode === "range") {
    if (parsed.startDate > parsed.endDate) {
      return NextResponse.json(
        { error: "startDate must be on or before endDate" },
        { status: 400 },
      );
    }
    affectedYmd = enumerateInclusiveYmd(parsed.startDate, parsed.endDate);
  } else {
    affectedYmd = [parsed.singleDate];
  }

  if (affectedYmd.length === 0) {
    return NextResponse.json({ error: "No dates in range" }, { status: 400 });
  }
  if (
    parsed.mode === "range" &&
    affectedYmd.length > MAX_DOCTOR_AVAILABILITY_RANGE_DAYS
  ) {
    return NextResponse.json(
      {
        error:
          "You can set availability for up to 65 days at a time. For longer periods, save in smaller chunks.",
      },
      { status: 400 },
    );
  }

  for (const d of affectedYmd) {
    if (d < today) {
      return NextResponse.json(
        { error: "Cannot set availability for past dates" },
        { status: 400 },
      );
    }
    if (clearDay && d === today) {
      return NextResponse.json(
        { error: "Cannot mark a day in progress as a holiday" },
        { status: 400 },
      );
    }
  }

  const affectedDates = affectedYmd.map((date) => ymdToPrismaDate(date));

  if (parsed.mode === "range" && !clearDay) {
    const existingInRange = await prisma.doctorAvailability.count({
      where: { doctorId: doctor.id, date: { in: affectedDates } },
    });
    if (existingInRange > 0) {
      return NextResponse.json(
        {
          error:
            "Range save is only allowed when every day in the range has no saved availability yet. At least one date already has availability; use single-day save or View Schedule → Edit for those days.",
        },
        { status: 400 },
      );
    }
  }
  const activeAppointments = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      date: { in: affectedDates },
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
    },
    select: {
      id: true,
      date: true,
      time: true,
      durationMinutes: true,
      patientName: true,
      email: true,
      phone: true,
      consultationType: true,
      timezone: true,
    },
  });
  const appointmentsByDate = new Map<string, { id: string; time: string; durationMinutes: number }[]>();
  for (const appointment of activeAppointments) {
    const dateKey = appointment.date.toISOString().slice(0, 10);
    const current = appointmentsByDate.get(dateKey) ?? [];
    current.push({ id: appointment.id, time: appointment.time, durationMinutes: appointment.durationMinutes });
    appointmentsByDate.set(dateKey, current);
  }

  if (slotStarts.length > 0 || removedSlots.length > 0) {
    const selectedStarts = new Set(slotStarts);
    for (const ymdStr of affectedYmd) {
      const booked = appointmentsByDate.get(ymdStr) ?? [];
      const removedBookedSlots =
        parsed.mode === "single" && (newSlots.length > 0 || removedSlots.length > 0)
          ? booked
              .filter((appointment) => removedSlots.includes(appointment.time))
              .map((appointment) => appointment.time)
          : booked
              .filter((appointment) => !selectedStarts.has(appointment.time))
              .map((appointment) => appointment.time);
      if (removedBookedSlots.length > 0) {
        return NextResponse.json(
          {
            error: `Cannot remove booked slots (${removedBookedSlots.join(", ")}). Booked slots are locked.`,
          },
          { status: 409 },
        );
      }
    }
  }

  if (parsed.mode === "single" && newSlots.length > 0) {
    const newSlotSet = new Set(newSlots);
    for (const ymdStr of affectedYmd) {
      const booked = appointmentsByDate.get(ymdStr) ?? [];
      const conflicting: string[] = [];
      for (const appt of booked) {
        if (newSlotSet.has(appt.time)) {
          conflicting.push(appt.time);
          continue;
        }
        const apptDur = appt.durationMinutes || duration;
        const overlapsNew = newSlots.some((ns) => {
          const nsDur = perSlotDuration[ns] ?? duration;
          return slotOverlapsRange(appt.time, apptDur, ns, slotEndFromStart(ns, nsDur));
        });
        if (overlapsNew) conflicting.push(appt.time);
      }
      if (conflicting.length > 0) {
        return NextResponse.json(
          {
            error: `Cannot save: existing booked appointment(s) at ${conflicting.sort().join(", ")} overlap your new time window. Adjust your new slots to avoid these times.`,
          },
          { status: 409 },
        );
      }
    }
  }

  try {
    if (parsed.mode === "range" && !clearDay) {
      const rows = affectedYmd.flatMap((ymdStr) => {
        const date = ymdToPrismaDate(ymdStr);
        return slotStarts.map((startTime) => {
          const slotDurationMinutes = perSlotDuration[startTime] ?? duration;
          return {
            doctorId: doctor.id,
            date,
            startTime,
            endTime: slotEndFromStart(startTime, slotDurationMinutes),
            slotDurationMinutes,
            consultationType:
              perSlotConsultation[startTime] ?? defaultConsultationType,
          };
        });
      });

      await prisma.$transaction(
        async (tx) => {
          await tx.doctor.update({
            where: { id: doctor.id },
            data: { slotDurationMinutes: duration },
          });
          await tx.doctorAvailability.deleteMany({
            where: { doctorId: doctor.id, date: { in: affectedDates } },
          });
          await tx.doctorAvailability.createMany({
            data: rows,
          });
        },
        { timeout: 30_000 },
      );
    } else if (clearDay) {
      await prisma.$transaction(
        async (tx) => {
          await tx.doctor.update({
            where: { id: doctor.id },
            data: { slotDurationMinutes: duration },
          });
          await tx.doctorAvailability.deleteMany({
            where: { doctorId: doctor.id, date: { in: affectedDates } },
          });
        },
        { timeout: 30_000 },
      );
    } else {
      await prisma.$transaction(
        async (tx) => {
          await tx.doctor.update({
            where: { id: doctor.id },
            data: { slotDurationMinutes: duration },
          });

          for (const ymdStr of affectedYmd) {
            const date = ymdToPrismaDate(ymdStr);

            const existingRows = await tx.doctorAvailability.findMany({
              where: { doctorId: doctor.id, date },
              select: {
                startTime: true,
                slotDurationMinutes: true,
                consultationType: true,
              },
            });

            const bookedTimesForDay = new Set(
              (appointmentsByDate.get(ymdStr) ?? []).map((a) => a.time),
            );

            const mergedSlots = mergeAvailabilitySlotsForDay({
              existingRows,
              mode: parsed.mode,
              slotStarts,
              newSlots,
              removedSlots,
              perSlotDuration,
              perSlotConsultation,
              duration,
              defaultConsultationType,
              bookedTimesForDay,
            });

            await tx.doctorAvailability.deleteMany({
              where: { doctorId: doctor.id, date },
            });
            await tx.doctorAvailability.createMany({
              data: toDoctorAvailabilityCreateRows({
                doctorId: doctor.id,
                date,
                mergedSlots,
              }),
            });
          }
        },
        { timeout: 30_000 },
      );
    }
  } catch (error) {
    if (isAvailabilitySaveTimeoutError(error)) {
      return NextResponse.json(
        {
          error:
            "Saving availability took too long. Try a shorter date range or save again.",
        },
        { status: 504 },
      );
    }
    console.error("[availability/save] Save failed:", error);
    return NextResponse.json(
      { error: "Could not save availability, please try again." },
      { status: 500 },
    );
  }

  if (clearDay && activeAppointments.length > 0) {
    const requestOrigin = new URL(request.url).origin;
    for (const appointment of activeAppointments) {
      await cancelAppointmentByDoctor({
        appointmentId: appointment.id,
        doctorId: doctor.id,
        reason: "doctor_holiday",
        requestOrigin,
        actorUserId: session.user.id,
      });
    }

    // Send the doctor a single summary email of everything that was
    // cancelled. Best-effort — failures are logged but don't fail the
    // availability update.
    const doctorEmail = doctor.user?.email?.trim();
    if (doctorEmail && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const grouped: Record<string, DoctorHolidaySummaryItem[]> = {};
        for (const appt of activeAppointments) {
          const ymdStr = appt.date.toISOString().slice(0, 10);
          const dateLabel = formatDateInDoctorTz(
            ymdStr,
            appt.time,
            doctor.timezone,
          );
          const timeLabel = formatTimeInDoctorTz(
            ymdStr,
            appt.time,
            doctor.timezone,
          );
          const list = grouped[dateLabel] ?? (grouped[dateLabel] = []);
          list.push({
            patientName: appt.patientName,
            appointmentTime: timeLabel,
            consultationLabel:
              appt.consultationType === "ONLINE" ? "Online" : "In-clinic",
            patientEmail: appt.email,
            patientPhone: appt.phone,
          });
        }
        const dateLabels = Object.keys(grouped).sort();
        const { error: emailError } = await resend.emails.send({
          from: getEmailFrom(),
          to: doctorEmail,
          subject: `Holiday cancellation summary — ${activeAppointments.length} appointment${activeAppointments.length === 1 ? "" : "s"}`,
          react: DoctorHolidaySummaryEmailTemplate({
            doctorName: doctor.name,
            dateLabels,
            doctorTimezone: doctor.timezone,
            appointmentsByDate: grouped,
          }),
        });
        if (emailError) {
          console.error(
            "[availability/holiday] Summary email failed:",
            emailError,
          );
        }
      } catch (err) {
        console.error("[availability/holiday] Summary email threw:", err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    affectedDates: affectedYmd.length,
    cancelledAppointments: clearDay ? activeAppointments.length : 0,
  });
}

const deleteBodySchema = z.object({
  date: ymd,
  slotStarts: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
});

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.DOCTOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const doctor = await prisma.doctor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, timezone: true },
  });
  if (!doctor) {
    return NextResponse.json(
      { error: "Doctor profile not found" },
      { status: 404 },
    );
  }

  let parsed: z.infer<typeof deleteBodySchema>;
  try {
    const json: unknown = await request.json();
    parsed = deleteBodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const tz = doctor.timezone;
  const today = getDoctorLocalTodayIso(tz);

  if (parsed.date < today) {
    return NextResponse.json(
      { error: "Cannot delete slots for past dates" },
      { status: 400 },
    );
  }

  const date = ymdToPrismaDate(parsed.date);
  const slotStartSet = new Set(parsed.slotStarts);

  const bookedAppointments = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      date,
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
      time: { in: [...slotStartSet] },
    },
    select: { time: true },
  });

  if (bookedAppointments.length > 0) {
    const bookedTimes = bookedAppointments.map((a) => a.time).sort();
    return NextResponse.json(
      {
        error: `Cannot delete booked slots (${bookedTimes.join(", ")}). Cancel the appointments first.`,
      },
      { status: 409 },
    );
  }

  const result = await prisma.doctorAvailability.deleteMany({
    where: {
      doctorId: doctor.id,
      date,
      startTime: { in: [...slotStartSet] },
    },
  });

  return NextResponse.json({ ok: true, deletedCount: result.count });
}
