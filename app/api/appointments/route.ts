import { EmailTemplate } from "@/components/email-template";
import { prisma } from "@/lib/db";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { Resend } from "resend";
import { getEmailFrom } from "@/lib/email-from";
import { z } from "zod";
import {
  AppointmentStatus,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth/next";
import { inngest } from "@/inngest/client";
import {
  coerceAllowedSlotDurationMinutes,
  resolveSlotMetaForStart,
} from "@/lib/doctor-availability-slots";
import { parsePriceMap, priceCentsForDuration } from "@/lib/doctor-pricing";
import { coerceSupportedCurrency } from "@/lib/currency";
import {
  clinicT120ReminderAtMs,
  reminderAtMsFromPatientLocal,
} from "@/lib/reminder-time";
import { countUpcomingAppointmentsForEmail } from "@/lib/upcoming-appointments";
import {
  formatDateInDoctorTz,
  formatDateInPatientTz,
  formatTimeInDoctorTz,
  formatTimeInPatientTz,
  isDoctorSlotInPast,
  PAST_OR_UNAVAILABLE_SLOT_MESSAGE,
} from "@/lib/timezone-display";
import {
  createAppointmentNotificationForEmail,
  createDoctorNotificationForDoctorId,
} from "@/lib/notifications";
import { buildEmailPriceLabels } from "@/lib/email-price-labels";
import { bookingConfirmationEmailMessage } from "@/lib/reschedule-policy-copy";
import { publicDoctorByIdWhere } from "@/lib/doctor-visibility";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { fromZonedTime } from "date-fns-tz";
import {
  assertSlotBookable,
  SLOT_NO_LONGER_AVAILABLE_MESSAGE,
} from "@/lib/slot-availability";
import { consumeSlotHold } from "@/lib/slot-hold-server";
import { triggerSlotUpdated } from "@/lib/pusher-server";

const resend = new Resend(process.env.RESEND_API_KEY);

const appointmentSchema = z.object({
  doctorId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(1),
  patientName: z.string().min(1),
  email: z.string().email(),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number"),
  notes: z.string().optional(),
  /** In-clinic only; online bookings use Stripe + webhook. */
  consultationType: z.literal("CLINIC").default("CLINIC"),
  availabilityId: z.string().optional(),
  holdId: z.string().uuid().optional(),
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

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = appointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const {
    doctorId,
    date: dateParam,
    time,
    patientName,
    email,
    phone,
    notes,
    consultationType,
    availabilityId,
    holdId: excludeSlotHoldId,
    patientTimezone,
  } = parsed.data;

  const date = parseDateOnly(dateParam);
  if (!date) {
    return NextResponse.json(
      { error: "Invalid date. Use YYYY-MM-DD." },
      { status: 400 },
    );
  }

  const doctor = await prisma.doctor.findFirst({
    where: publicDoctorByIdWhere(doctorId),
    select: {
      id: true,
      name: true,
      timezone: true,
      slotDurationMinutes: true,
      consultationPriceCentsByDuration: true,
      currency: true,
    },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const doctorTimezone = doctor.timezone;
  const availabilityRows = await prisma.doctorAvailability.findMany({
    where: { doctorId, date },
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

  // Hard server-side guard: reject slots that have already started in
  // the doctor's timezone, even if the client is stale.
  if (isDoctorSlotInPast(dateParam, time, doctorTimezone)) {
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
  if (slotMeta.consultationType === "ONLINE") {
    return NextResponse.json(
      { error: "This slot is only available for online consultations" },
      { status: 409 },
    );
  }

  const existingSameDateCandidates = await prisma.appointment.findMany({
    where: {
      email,
      doctorId,
      date,
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    },
    select: {
      id: true,
      rescheduleToken: true,
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
    let rescheduleToken = existingSameDate.rescheduleToken;
    if (!rescheduleToken) {
      rescheduleToken = randomBytes(32).toString("hex");
      await prisma.appointment.update({
        where: { id: existingSameDate.id },
        data: { rescheduleToken },
      });
    }

    return NextResponse.json(
      {
        error:
          "You already have an appointment on this date. Would you like to reschedule it instead?",
        code: "EXISTING_APPOINTMENT_SAME_DATE",
        link: {
          href: `/reschedule?appointmentId=${encodeURIComponent(
            existingSameDate.id,
          )}&token=${encodeURIComponent(rescheduleToken)}`,
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

  const slotBookable = await assertSlotBookable({
    doctorId,
    dateYmd: dateParam,
    time,
    excludeSlotHoldId,
  });
  if (!slotBookable.ok) {
    return NextResponse.json(
      { error: SLOT_NO_LONGER_AVAILABLE_MESSAGE },
      { status: 409 },
    );
  }

  const cancelToken = randomBytes(32).toString("hex");
  const rescheduleToken = randomBytes(32).toString("hex");
  const priceCentsAtBooking = priceCentsForDuration(
    parsePriceMap(doctor.consultationPriceCentsByDuration),
    slotMeta.slotDurationMinutes,
  );
  const currencyAtBooking = coerceSupportedCurrency(doctor.currency);

  let appointment;
  try {
    appointment = await prisma.appointment.create({
      data: {
        doctorId,
        date,
        time,
        patientName,
        email,
        phone,
        notes,
        consultationType,
        durationMinutes: slotMeta.slotDurationMinutes,
        priceCentsAtBooking,
        currencyAtBooking,
        timezone: doctorTimezone,
        patientTimezone,
        status: AppointmentStatus.CONFIRMED,
        paymentMethod: PaymentMethod.PAY_AT_CLINIC,
        cancelToken,
        rescheduleToken,
      },
    });
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: SLOT_NO_LONGER_AVAILABLE_MESSAGE },
        { status: 409 },
      );
    }
    throw err;
  }

  if (excludeSlotHoldId) {
    await consumeSlotHold({
      holdId: excludeSlotHoldId,
      doctorId,
      dateYmd: dateParam,
      time,
    });
  }

  await triggerSlotUpdated(doctorId, { date: dateParam, time });

  const headersList = await headers();
  const origin =
    headersList.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";

  const cancelUrl = `${origin}/cancel?appointmentId=${encodeURIComponent(
    appointment.id,
  )}&token=${encodeURIComponent(cancelToken)}`;
  const rescheduleUrl = `${origin}/reschedule?appointmentId=${encodeURIComponent(
    appointment.id,
  )}&token=${encodeURIComponent(rescheduleToken)}`;

  const { priceLabel, approxLocalPriceLabel } = await buildEmailPriceLabels({
    priceCents: priceCentsAtBooking,
    baseCurrency: currencyAtBooking,
    patientTimezone,
  });

  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: email,
      subject: "Appointment Confirmation",
      react: EmailTemplate({
        message: bookingConfirmationEmailMessage("CLINIC"),
        doctorName: doctor.name,
        appointmentDate: formatDateInPatientTz(dateParam, time, doctorTimezone, patientTimezone),
        appointmentTime: formatTimeInPatientTz(dateParam, time, doctorTimezone, patientTimezone),
        patientName,
        consultationType,
        cancelUrl,
        rescheduleUrl,
        priceLabel,
        approxLocalPriceLabel,
        isPricePaid: appointment.paymentStatus === PaymentStatus.PAID,
        durationMinutes: appointment.durationMinutes,
      }),
    });
    if (error) {
      console.error("[appointments] Confirmation email failed:", error);
    }
  } catch (err) {
    console.error("[appointments] Confirmation email failed:", err);
  }

  // No in-app patient notification for self-service booking: confirmation email
  // and the on-page success state are enough; avoids duplicate toasts from polling.

  try {
    const doctorDateLabel = formatDateInDoctorTz(dateParam, time, doctorTimezone);
    const doctorTimeLabel = formatTimeInDoctorTz(dateParam, time, doctorTimezone);
    const modality = "in-clinic";
    await createDoctorNotificationForDoctorId({
      doctorId,
      type: NotificationType.APPOINTMENT_BOOKED,
      title: "New appointment booked",
      message: `${patientName} booked a ${modality} appointment for ${doctorDateLabel} at ${doctorTimeLabel}.`,
      actorUserId: session?.user?.id ?? null,
    });
  } catch (err) {
    console.error("[appointments] Failed to create doctor notification:", err);
  }
  try {
    const doctorDateLabel = formatDateInPatientTz(
      dateParam,
      time,
      doctorTimezone,
      patientTimezone,
    );
    const doctorTimeLabel = formatTimeInPatientTz(
      dateParam,
      time,
      doctorTimezone,
      patientTimezone,
    );
    await createAppointmentNotificationForEmail({
      patientEmail: email,
      type: NotificationType.APPOINTMENT_BOOKED,
      title: "Appointment booked",
      message: `Your in-clinic appointment with ${formatDoctorDisplayName(doctor.name)} is confirmed for ${doctorDateLabel} at ${doctorTimeLabel}.`,
      actorUserId: session?.user?.id ?? null,
    });
  } catch (err) {
    console.error("[appointments] Failed to create patient notification:", err);
  }

  try {
    const reminderAtMs = reminderAtMsFromPatientLocal(
      dateParam,
      time,
      doctorTimezone,
    );

    if (reminderAtMs !== null) {
      await inngest.send({
        name: "appointment/reminder.scheduled",
        data: {
          appointmentId: appointment.id,
        },
        ts: reminderAtMs,
      });
    }
  } catch (err) {
    console.error("[appointments] Failed to schedule reminder:", err);
  }

  try {
    const t120Ms = clinicT120ReminderAtMs(dateParam, time, doctorTimezone);
    if (t120Ms !== null) {
      await inngest.send({
        name: "appointment/clinic-reminder-t120.scheduled",
        data: {
          appointmentId: appointment.id,
        },
        ts: t120Ms,
      });
    }
  } catch (err) {
    console.error("[appointments] Failed to schedule 2-hour clinic reminder:", err);
  }

  return NextResponse.json(appointment);
}
