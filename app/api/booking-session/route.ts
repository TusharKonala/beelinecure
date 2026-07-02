import { prisma } from "@/lib/db";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { publicDoctorByIdWhere } from "@/lib/doctor-visibility";
import { AppointmentStatus, BookingSessionStatus, SlotHoldStatus, UserRole } from "@/generated/prisma/client";
import {
  coerceAllowedSlotDurationMinutes,
  resolveSlotMetaForStart,
} from "@/lib/doctor-availability-slots";
import {
  parsePriceMap,
  priceCentsForDuration,
} from "@/lib/doctor-pricing";
import { coerceSupportedCurrency } from "@/lib/currency";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth/next";
import { countUpcomingAppointmentsForEmail } from "@/lib/upcoming-appointments";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import {
  isDoctorSlotInPast,
  PAST_OR_UNAVAILABLE_SLOT_MESSAGE,
} from "@/lib/timezone-display";
import {
  DOCTOR_CALENDAR_NOT_CONNECTED_CODE,
  DOCTOR_CALENDAR_NOT_CONNECTED_MESSAGE,
  isDoctorGoogleCalendarConnected,
} from "@/lib/doctor-online-booking";
import {
  assertSlotBookable,
  SLOT_NO_LONGER_AVAILABLE_MESSAGE,
} from "@/lib/slot-availability";
import {
  DOCTOR_TIMEZONE_CHANGED_CODE,
  DOCTOR_TIMEZONE_CHANGED_MESSAGE,
} from "@/lib/slot-hold-shared";
import {
  acquireDoctorDateLock,
  SlotUnavailableError,
} from "@/lib/slot-lock";
import { triggerSlotUpdated } from "@/lib/pusher-server";

const bookingSessionSchema = z.object({
  doctorId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(1),
  /** Online consultation or prepaid clinic visit (Stripe checkout). */
  consultationType: z.enum(["ONLINE", "CLINIC"]),
  availabilityId: z.string().optional(),
  /** When re-submitting for the same slot, exclude this session from the soft-hold check. */
  bookingSessionId: z.string().optional(),
  /** Slot hold acquired on the book page before form submit. */
  holdId: z.string().uuid().optional(),
  patientName: z.string().min(1),
  email: z.string().email(),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number"),
  notes: z.string().optional(),
  timezone: z.string().min(1).max(128).default("UTC"),
  patientTimezone: z.string().min(1).max(128).default("UTC"),
});

function parseDateOnly(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === UserRole.DOCTOR) {
    return NextResponse.json(
      { error: "Doctors cannot book consultations." },
      { status: 403 },
    );
  }
  if (session?.user?.role === UserRole.ADMIN) {
    return NextResponse.json(
      { error: "Admins cannot book through the patient booking flow." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bookingSessionSchema.safeParse(body);

  if (!parsed.success) {
    console.log(parsed.error.flatten());
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const {
    doctorId,
    date,
    time,
    consultationType,
    availabilityId,
    bookingSessionId: excludeBookingSessionId,
    holdId: excludeSlotHoldId,
    patientName,
    email,
    phone,
    notes,
    timezone: clientDoctorTimezone,
    patientTimezone,
  } = parsed.data;

  const appointmentDate = parseDateOnly(date);
  if (!appointmentDate) {
    return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });
  }

  const doctor = await prisma.doctor.findFirst({
    where: publicDoctorByIdWhere(doctorId),
    select: {
      id: true,
      timezone: true,
      slotDurationMinutes: true,
      currency: true,
      consultationPriceCentsByDuration: true,
      googleCalendarRefreshToken: true,
    },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const doctorTimezone = doctor.timezone;
  if (clientDoctorTimezone !== doctorTimezone) {
    return NextResponse.json(
      {
        error: DOCTOR_TIMEZONE_CHANGED_MESSAGE,
        code: DOCTOR_TIMEZONE_CHANGED_CODE,
      },
      { status: 409 },
    );
  }
  const availabilityRows = await prisma.doctorAvailability.findMany({
    where: { doctorId, date: appointmentDate },
  });
  const fallbackDuration = coerceAllowedSlotDurationMinutes(
    doctor.slotDurationMinutes,
  );
  const slotMeta = resolveSlotMetaForStart(
    availabilityRows,
    time,
    fallbackDuration,
  );
  if (slotMeta === null) {
    return NextResponse.json(
      { error: "This time slot is no longer available" },
      { status: 409 },
    );
  }

  // Hard server-side guard: reject slots that have already started in the
  // doctor's timezone, even if the patient page is stale.
  if (isDoctorSlotInPast(date, time, doctorTimezone)) {
    return NextResponse.json(
      { error: PAST_OR_UNAVAILABLE_SLOT_MESSAGE },
      { status: 409 },
    );
  }
  if (
    availabilityId &&
    slotMeta.availabilityId !== availabilityId
  ) {
    return NextResponse.json(
      { error: "This slot window changed. Please select the slot again." },
      { status: 409 },
    );
  }
  const slotAllowsOnline =
    slotMeta.consultationType === "ONLINE" || slotMeta.consultationType === "BOTH";
  const slotAllowsClinic =
    slotMeta.consultationType === "CLINIC" || slotMeta.consultationType === "BOTH";
  if (consultationType === "ONLINE" && !slotAllowsOnline) {
    return NextResponse.json(
      {
        error: "This slot is not available for online consultation",
      },
      { status: 409 },
    );
  }
  if (consultationType === "CLINIC" && !slotAllowsClinic) {
    return NextResponse.json(
      {
        error: "This slot is not available for clinic visits",
      },
      { status: 409 },
    );
  }
  if (consultationType === "ONLINE" && !isDoctorGoogleCalendarConnected(doctor)) {
    return NextResponse.json(
      {
        error: DOCTOR_CALENDAR_NOT_CONNECTED_MESSAGE,
        code: DOCTOR_CALENDAR_NOT_CONNECTED_CODE,
      },
      { status: 409 },
    );
  }

  const slotBookable = await assertSlotBookable({
    doctorId,
    dateYmd: date,
    time,
    excludeBookingSessionId,
    excludeSlotHoldId,
  });
  if (!slotBookable.ok) {
    return NextResponse.json(
      { error: SLOT_NO_LONGER_AVAILABLE_MESSAGE },
      { status: 409 },
    );
  }

  const existingSameDateCandidates = await prisma.appointment.findMany({
    where: {
      email,
      doctorId,
      date: appointmentDate,
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    },
    select: {
      date: true,
      time: true,
      timezone: true,
    },
  });

  const nowMs = Date.now();
  const existingSameDate = existingSameDateCandidates.find((candidate) => {
    const appointmentDateParam = candidate.date.toISOString().slice(0, 10);
    const timeWithSeconds =
      candidate.time.length === 5 ? `${candidate.time}:00` : candidate.time;
    const appointmentStartMs = fromZonedTime(
      `${appointmentDateParam}T${timeWithSeconds}`,
      candidate.timezone || doctorTimezone,
    ).getTime();
    return appointmentStartMs >= nowMs;
  });

  if (existingSameDate) {
    return NextResponse.json(
      {
        error:
          "You already have an upcoming appointment with this doctor. Only one visit per day is allowed. Would you like to reschedule it instead?",
        code: "EXISTING_APPOINTMENT_SAME_DATE",
        link: {
          href: "/patient/appointments",
          label: "reschedule it",
        },
      },
      { status: 409 },
    );
  }

  const upcomingCount = await countUpcomingAppointmentsForEmail(email);

  if (upcomingCount >= 2) {
    return NextResponse.json(
      {
        error:
          "You've reached the limit of 2 upcoming appointments. Please complete or cancel an existing appointment before booking a new one.",
        code: "UPCOMING_APPOINTMENT_LIMIT_REACHED",
        link: {
          href: "/patient/appointments",
          label: "cancel an existing appointment",
        },
      },
      { status: 409 },
    );
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Snapshot the price + currency the patient is being shown so payment is
  // anchored to this moment, even if the doctor edits their pricing map
  // before checkout completes.
  const priceMap = parsePriceMap(doctor.consultationPriceCentsByDuration);
  const currencyAtBooking = coerceSupportedCurrency(doctor.currency);

  let bookingSession;
  try {
    bookingSession = await prisma.$transaction(async (tx) => {
      await acquireDoctorDateLock(tx, doctorId, date);

      const rows = await tx.doctorAvailability.findMany({
        where: { doctorId, date: appointmentDate },
      });
      const txSlotMeta = resolveSlotMetaForStart(
        rows,
        time,
        fallbackDuration,
      );
      if (txSlotMeta === null) {
        throw new SlotUnavailableError();
      }

      await tx.bookingSession.updateMany({
        where: {
          status: BookingSessionStatus.PENDING,
          expiresAt: { lt: new Date() },
        },
        data: { status: BookingSessionStatus.EXPIRED },
      });

      const created = await tx.bookingSession.create({
        data: {
          doctorId,
          patientName,
          email,
          phone,
          date,
          time,
          durationMinutes: txSlotMeta.slotDurationMinutes,
          priceCentsAtBooking: priceCentsForDuration(
            priceMap,
            txSlotMeta.slotDurationMinutes,
          ),
          currencyAtBooking,
          timezone: doctorTimezone,
          patientTimezone,
          notes: notes,
          consultationType,
          status: BookingSessionStatus.PENDING,
          expiresAt,
        },
      });

      if (excludeSlotHoldId) {
        await tx.slotHold.updateMany({
          where: {
            id: excludeSlotHoldId,
            doctorId,
            date,
            time,
            status: SlotHoldStatus.ACTIVE,
          },
          data: { status: SlotHoldStatus.CONSUMED },
        });
      }

      return created;
    });
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      return NextResponse.json(
        { error: "This time slot is no longer available" },
        { status: 409 },
      );
    }
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: SLOT_NO_LONGER_AVAILABLE_MESSAGE },
        { status: 409 },
      );
    }
    throw err;
  }

  await triggerSlotUpdated(doctorId, { date, time });

  return NextResponse.json({ bookingSessionId: bookingSession.id });
}
