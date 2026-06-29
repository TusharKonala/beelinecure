import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import {
  BookingSessionStatus,
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  ConsultationType,
  NotificationType,
  RefundStatus,
} from "@/generated/prisma/client";
import { EmailTemplate } from "@/components/email-template";
import { Resend } from "resend";
import { getEmailFrom } from "@/lib/email-from";
import { inngest } from "@/inngest/client";
import {
  clinicT120ReminderAtMs,
  onlineT15ReminderAtMs,
  reminderAtMsFromPatientLocal,
} from "@/lib/reminder-time";
import {
  formatDateInDoctorTz,
  formatDateInPatientTz,
  formatTimeInDoctorTz,
  formatTimeInPatientTz,
  isDoctorSlotInPast,
} from "@/lib/timezone-display";
import {
  createAppointmentNotificationForEmail,
  createDoctorNotificationForDoctorId,
} from "@/lib/notifications";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { scheduleAppointmentStartedEvent } from "@/lib/appointment-started-schedule";
import { triggerAppointmentsChanged, triggerSlotUpdated } from "@/lib/pusher-server";
import { createMeetEventForOnlineAppointment } from "@/lib/google-calendar-meet";
import { buildEmailPriceLabels } from "@/lib/email-price-labels";
import { bookingConfirmationEmailMessage, slotConflictRefundEmailMessage } from "@/lib/reschedule-policy-copy";
import { coerceSupportedCurrency } from "@/lib/currency";
import { parsePriceMap, priceCentsForDuration } from "@/lib/doctor-pricing";
import {
  coerceAllowedSlotDurationMinutes,
  resolveSlotMetaForStart,
} from "@/lib/doctor-availability-slots";
import { refundCheckoutSession } from "@/lib/refunds";
import type { BookingSession } from "@/generated/prisma/client";

const resend = new Resend(process.env.RESEND_API_KEY);

function parseDateOnly(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function handleBookingSlotConflict(input: {
  bookingSession: BookingSession;
  checkoutSession: Stripe.Checkout.Session;
  doctorDisplayName: string;
}): Promise<void> {
  const { bookingSession, checkoutSession, doctorDisplayName } = input;

  await prisma.bookingSession.update({
    where: { id: bookingSession.id },
    data: { status: BookingSessionStatus.FAILED },
  });

  const refundResult = await refundCheckoutSession({
    checkoutSessionId: checkoutSession.id,
    bookingSessionId: bookingSession.id,
    reason: "slot_taken",
  });

  let message = slotConflictRefundEmailMessage();
  if (!refundResult.ok) {
    message +=
      " We attempted to initiate your refund but ran into an issue. Our support team will follow up shortly to resolve it.";
  }

  const consultationType =
    bookingSession.consultationType === "CLINIC" ? "CLINIC" : "ONLINE";

  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: bookingSession.email,
      subject: "Appointment unavailable — refund initiated",
      react: EmailTemplate({
        heading: "Time slot unavailable",
        message,
        showActionLinks: false,
        doctorName: doctorDisplayName,
        appointmentDate: formatDateInPatientTz(
          bookingSession.date,
          bookingSession.time,
          bookingSession.timezone,
          bookingSession.patientTimezone,
        ),
        appointmentTime: formatTimeInPatientTz(
          bookingSession.date,
          bookingSession.time,
          bookingSession.timezone,
          bookingSession.patientTimezone,
        ),
        patientName: bookingSession.patientName,
        consultationType,
        cancelUrl: "",
        rescheduleUrl: "",
        durationMinutes: bookingSession.durationMinutes,
      }),
    });

    if (error) {
      console.error("[webhooks] Slot-conflict refund email failed:", error);
    }
  } catch (emailError) {
    console.error("[webhooks] Slot-conflict refund email failed:", emailError);
  }
}

export async function POST(request: NextRequest) {
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return new NextResponse("Webhook signature missing", { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata ?? {};

    const bookingSessionId = metadata.bookingSessionId;

    if (!bookingSessionId) {
      // Nothing to do if we cannot associate to a booking session
      return new NextResponse("OK", { status: 200 });
    }

    const bookingSession = await prisma.bookingSession.findUnique({
      where: { id: bookingSessionId },
    });

    if (!bookingSession) {
      // Ignore if the booking session no longer exists
      return new NextResponse("OK", { status: 200 });
    }

    if (bookingSession.status !== BookingSessionStatus.PENDING) {
      // Already processed or no longer valid – ignore duplicate webhooks
      return new NextResponse("OK", { status: 200 });
    }
    const date = parseDateOnly(bookingSession.date);

    if (!date) {
      console.error(
        "[webhooks] Invalid date on booking session",
        bookingSession.id,
        bookingSession.date,
      );
      return new NextResponse("OK", { status: 200 });
    }

    // Payment already succeeded — always create the appointment regardless of
    // the doctor's current visibility (e.g. admin deactivation between checkout
    // start and webhook delivery). Look up by id only; no isActive filter.
    const doctor = await prisma.doctor.findUnique({
      where: { id: bookingSession.doctorId },
    });

    if (!doctor) {
      console.error(
        "[webhooks] Doctor not found for booking session",
        bookingSession.id,
        bookingSession.doctorId,
      );
      return new NextResponse("OK", { status: 200 });
    }

    // Hard server-side guard: if the slot already started in the doctor's
    // timezone, do not create an appointment (Stripe payment succeeded,
    // but the slot is stale). Mark booking session as expired so future
    // retries won't create duplicates.
    const doctorDateYmd = bookingSession.date;
    if (
      isDoctorSlotInPast(
        doctorDateYmd,
        bookingSession.time,
        bookingSession.timezone,
      )
    ) {
      await prisma.bookingSession.update({
        where: { id: bookingSession.id },
        data: { status: BookingSessionStatus.EXPIRED },
      });
      return new NextResponse("OK", { status: 200 });
    }

    const availabilityRows = await prisma.doctorAvailability.findMany({
      where: { doctorId: bookingSession.doctorId, date },
    });
    const slotMeta = resolveSlotMetaForStart(
      availabilityRows,
      bookingSession.time,
      coerceAllowedSlotDurationMinutes(doctor.slotDurationMinutes),
    );
    if (slotMeta === null) {
      console.error(
        "[webhooks] Slot no longer in doctor availability (deleted/holiday), bookingSession:",
        bookingSession.id,
      );
      await handleBookingSlotConflict({
        bookingSession,
        checkoutSession: session,
        doctorDisplayName: formatDoctorDisplayName(doctor.name),
      });
      return new NextResponse("OK", { status: 200 });
    }

    const fallbackPriceCentsAtBooking = priceCentsForDuration(
      parsePriceMap(doctor.consultationPriceCentsByDuration),
      bookingSession.durationMinutes,
    );
    const fallbackCurrencyAtBooking = coerceSupportedCurrency(doctor.currency);
    const priceCentsAtBooking =
      typeof bookingSession.priceCentsAtBooking === "number"
        ? bookingSession.priceCentsAtBooking
        : fallbackPriceCentsAtBooking;
    const currencyAtBooking =
      typeof bookingSession.currencyAtBooking === "string" &&
      bookingSession.currencyAtBooking.trim().length > 0
        ? bookingSession.currencyAtBooking.trim().toUpperCase()
        : fallbackCurrencyAtBooking;

    const appointmentConsultationType =
      bookingSession.consultationType === "CLINIC"
        ? ConsultationType.CLINIC
        : ConsultationType.ONLINE;

    const cancelToken = randomBytes(32).toString("hex");
    const rescheduleToken = randomBytes(32).toString("hex");
    // Create the confirmed appointment from the booking session data
    let appointment;
    try {
      appointment = await prisma.appointment.create({
        data: {
          doctorId: bookingSession.doctorId,
          date,
          time: bookingSession.time,
          durationMinutes: bookingSession.durationMinutes,
          patientName: bookingSession.patientName,
          email: bookingSession.email,
          phone: bookingSession.phone,
          notes: bookingSession.notes,
          status: AppointmentStatus.CONFIRMED,
          consultationType: appointmentConsultationType,
          priceCentsAtBooking,
          currencyAtBooking,
          stripePaymentId: session.id,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.ONLINE,
          cancelToken,
          rescheduleToken,
          timezone: bookingSession.timezone,
          patientTimezone: bookingSession.patientTimezone,
        },
      });
    } catch (err) {
      if (
        err instanceof PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Concurrent webhook or slot taken: prefer idempotent recovery by checkout id
        const existing = await prisma.appointment.findFirst({
          where: { stripePaymentId: session.id },
        });
        if (existing) {
          appointment = existing;
        } else {
          console.error(
            "[webhooks] P2002 creating appointment (slot conflict), bookingSession:",
            bookingSession.id,
          );
          await handleBookingSlotConflict({
            bookingSession,
            checkoutSession: session,
            doctorDisplayName: formatDoctorDisplayName(doctor.name),
          });
          return new NextResponse("OK", { status: 200 });
        }
      } else {
        throw err;
      }
    }

    await triggerSlotUpdated(bookingSession.doctorId, {
      date: bookingSession.date,
      time: bookingSession.time,
    });
    await triggerAppointmentsChanged(bookingSession.doctorId, {
      appointmentId: appointment.id,
      reason: "booked",
    });

    const sessionAfter = await prisma.bookingSession.findUnique({
      where: { id: bookingSession.id },
    });
    if (sessionAfter?.status === BookingSessionStatus.COMPLETED) {
      return new NextResponse("OK", { status: 200 });
    }

    let meetLink: string | null = null;
    if (appointment.consultationType === ConsultationType.ONLINE) {
      const meet = await createMeetEventForOnlineAppointment(appointment.id);
      meetLink = meet.googleMeetUrl;
    }

    const headersList = await headers();
    const origin =
      headersList.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
      "http://localhost:3000";

    const cancelUrl = `${origin}/cancel?appointmentId=${encodeURIComponent(
      appointment.id,
    )}&token=${encodeURIComponent(appointment.cancelToken!)}`;
    const rescheduleUrl = `${origin}/reschedule?appointmentId=${encodeURIComponent(
      appointment.id,
    )}&token=${encodeURIComponent(appointment.rescheduleToken!)}`;

    // Mark the booking session as completed to avoid reprocessing
    await prisma.bookingSession.update({
      where: { id: bookingSession.id },
      data: { status: BookingSessionStatus.COMPLETED },
    });

    const { priceLabel, approxLocalPriceLabel } = await buildEmailPriceLabels({
      priceCents: priceCentsAtBooking,
      baseCurrency: currencyAtBooking,
      patientTimezone: bookingSession.patientTimezone,
    });

    // Reuse existing confirmation email logic
    try {
      const { error } = await resend.emails.send({
        from: getEmailFrom(),
        to: appointment.email,
        subject: "Appointment Confirmation",
        react: EmailTemplate({
          message: bookingConfirmationEmailMessage(
            bookingSession.consultationType === ConsultationType.ONLINE
              ? "ONLINE"
              : "CLINIC",
          ),
          doctorName: doctor.name,
          appointmentDate: formatDateInPatientTz(
            bookingSession.date,
            bookingSession.time,
            bookingSession.timezone,
            bookingSession.patientTimezone,
          ),
          appointmentTime: formatTimeInPatientTz(
            bookingSession.date,
            bookingSession.time,
            bookingSession.timezone,
            bookingSession.patientTimezone,
          ),
          patientName: bookingSession.patientName,
          consultationType: bookingSession.consultationType as
            | "CLINIC"
            | "ONLINE",
          cancelUrl,
          rescheduleUrl,
          meetLink,
          priceLabel,
          approxLocalPriceLabel,
          isPricePaid: appointment.paymentStatus === PaymentStatus.PAID,
          durationMinutes: bookingSession.durationMinutes,
        }),
      });

      if (error) {
        console.error("[webhooks] Confirmation email failed:", error);
      }
    } catch (emailError) {
      console.error("[webhooks] Confirmation email failed:", emailError);
    }

    try {
      const patientDateLabel = formatDateInPatientTz(
        bookingSession.date,
        bookingSession.time,
        bookingSession.timezone,
        bookingSession.patientTimezone,
      );
      const patientTimeLabel = formatTimeInPatientTz(
        bookingSession.date,
        bookingSession.time,
        bookingSession.timezone,
        bookingSession.patientTimezone,
      );
      const patientModality =
        appointmentConsultationType === ConsultationType.ONLINE
          ? "online"
          : "in-clinic";
      await createAppointmentNotificationForEmail({
        patientEmail: bookingSession.email,
        type: NotificationType.APPOINTMENT_BOOKED,
        title: "Appointment booked",
        message: `Your ${patientModality} appointment with ${formatDoctorDisplayName(doctor.name)} is confirmed for ${patientDateLabel} at ${patientTimeLabel}.`,
        actorUserId:
          (
            await prisma.user.findUnique({
              where: { email: bookingSession.email.toLowerCase() },
              select: { id: true },
            })
          )?.id ?? null,
      });
    } catch (err) {
      console.error("[webhooks] Failed to create patient notification:", err);
    }

    try {
      const doctorDateLabel = formatDateInDoctorTz(
        bookingSession.date,
        bookingSession.time,
        bookingSession.timezone,
      );
      const doctorTimeLabel = formatTimeInDoctorTz(
        bookingSession.date,
        bookingSession.time,
        bookingSession.timezone,
      );
      const modality =
        appointment.consultationType === ConsultationType.ONLINE
          ? "online"
          : "in-clinic";
      await createDoctorNotificationForDoctorId({
        doctorId: bookingSession.doctorId,
        type: NotificationType.APPOINTMENT_BOOKED,
        title: "New appointment booked",
        message: `${bookingSession.patientName} booked a ${modality} appointment for ${doctorDateLabel} at ${doctorTimeLabel}.`,
      });
    } catch (err) {
      console.error("[webhooks] Failed to create doctor notification:", err);
    }

    try {
      const reminderAtMs = reminderAtMsFromPatientLocal(
        bookingSession.date,
        bookingSession.time,
        bookingSession.timezone,
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
      console.error("[webhooks] Failed to schedule reminder:", err);
    }

    // 15-minute "join now" reminder for online appointments only.
    if (appointment.consultationType === ConsultationType.ONLINE) {
      try {
        const t15Ms = onlineT15ReminderAtMs(
          bookingSession.date,
          bookingSession.time,
          bookingSession.timezone,
        );
        if (t15Ms !== null) {
          await inngest.send({
            name: "appointment/online-reminder-t15.scheduled",
            data: { appointmentId: appointment.id },
            ts: t15Ms,
          });
        }
      } catch (err) {
        console.error("[webhooks] Failed to schedule 15-min reminder:", err);
      }
    }

    if (appointment.consultationType === ConsultationType.CLINIC) {
      try {
        const t120Ms = clinicT120ReminderAtMs(
          bookingSession.date,
          bookingSession.time,
          bookingSession.timezone,
        );
        if (t120Ms !== null) {
          await inngest.send({
            name: "appointment/clinic-reminder-t120.scheduled",
            data: { appointmentId: appointment.id },
            ts: t120Ms,
          });
        }
      } catch (err) {
        console.error("[webhooks] Failed to schedule 2-hour clinic reminder:", err);
      }
    }

    try {
      await scheduleAppointmentStartedEvent({
        appointmentId: appointment.id,
        dateParam: bookingSession.date,
        time: bookingSession.time,
        timezone: bookingSession.timezone,
      });
    } catch (err) {
      console.error("[webhooks] Failed to schedule started event:", err);
    }
  }

  if (
    event.type === "refund.created" ||
    event.type === "refund.updated" ||
    event.type === "refund.failed"
  ) {
    await handleRefundEvent(event);
  }

  return new NextResponse("OK", { status: 200 });
}

async function handleRefundEvent(event: Stripe.Event) {
  const refund = event.data.object as Stripe.Refund;

  // Locate the appointment this refund belongs to. Prefer the refund id we
  // persisted when initiating the refund; fall back to the payment intent for
  // refunds that were created out-of-band (e.g. manually in the Stripe dashboard).
  const paymentIntentId =
    typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : (refund.payment_intent?.id ?? null);

  let appointment = await prisma.appointment.findFirst({
    where: { stripeRefundId: refund.id },
    select: {
      id: true,
      email: true,
      patientName: true,
      date: true,
      time: true,
      timezone: true,
      patientTimezone: true,
      consultationType: true,
      doctorId: true,
      refundStatus: true,
    },
  });

  if (!appointment && paymentIntentId) {
    appointment = await prisma.appointment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      select: {
        id: true,
        email: true,
        patientName: true,
        date: true,
        time: true,
        timezone: true,
        patientTimezone: true,
        consultationType: true,
        doctorId: true,
        refundStatus: true,
      },
    });
  }

  if (!appointment) {
    console.warn(
      "[webhooks] Refund event did not match any appointment:",
      event.type,
      refund.id,
    );
    return;
  }

  // Map the Stripe refund lifecycle (+ the dedicated refund.failed event) to
  // our internal RefundStatus. Treat anything non-final (pending / requires
  // action) as PENDING so the UI reflects "in progress" rather than "done".
  const isFailedEvent = event.type === "refund.failed";
  const nextStatus: RefundStatus = isFailedEvent
    ? RefundStatus.FAILED
    : refund.status === "succeeded"
      ? RefundStatus.SUCCEEDED
      : refund.status === "failed" || refund.status === "canceled"
        ? RefundStatus.FAILED
        : RefundStatus.PENDING;

  // Idempotency: skip if the status is unchanged, so retried webhooks don't
  // re-send failure emails or duplicate notifications.
  if (appointment.refundStatus === nextStatus) {
    return;
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      refundStatus: nextStatus,
      stripeRefundId: refund.id,
      ...(refund.amount ? { refundAmountCents: refund.amount } : {}),
      ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
    },
  });

  if (nextStatus !== RefundStatus.FAILED) {
    return;
  }

  // Refund failure: notify the patient via email and in-app notification.
  try {
    const doctor = await prisma.doctor.findUnique({
      where: { id: appointment.doctorId },
      select: { name: true },
    });
    const appointmentDate = appointment.date.toISOString().slice(0, 10);
    const formattedDate = formatDateInPatientTz(
      appointmentDate,
      appointment.time,
      appointment.timezone,
      appointment.patientTimezone,
    );
    const formattedTime = formatTimeInPatientTz(
      appointmentDate,
      appointment.time,
      appointment.timezone,
      appointment.patientTimezone,
    );

    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: appointment.email,
      subject: "Refund Failed",
      react: EmailTemplate({
        heading: "Refund Failed",
        message:
          "We were unable to process your refund automatically. Our support team has been alerted and will reach out to resolve this as soon as possible.",
        showActionLinks: false,
        doctorName: doctor?.name ?? "Your Doctor",
        appointmentDate: formattedDate,
        appointmentTime: formattedTime,
        patientName: appointment.patientName,
        consultationType: appointment.consultationType,
        cancelUrl: "",
        rescheduleUrl: "",
      }),
    });

    if (error) {
      console.error("[webhooks] Refund-failed email failed:", error);
    }
  } catch (err) {
    console.error("[webhooks] Refund-failed email failed:", err);
  }

  try {
    const doctor = await prisma.doctor.findUnique({
      where: { id: appointment.doctorId },
      select: { name: true },
    });
    const doctorDisplayName = doctor?.name
      ? formatDoctorDisplayName(doctor.name)
      : null;
    const appointmentDate = appointment.date.toISOString().slice(0, 10);
    const formattedDate = formatDateInPatientTz(
      appointmentDate,
      appointment.time,
      appointment.timezone,
      appointment.patientTimezone,
    );
    const formattedTime = formatTimeInPatientTz(
      appointmentDate,
      appointment.time,
      appointment.timezone,
      appointment.patientTimezone,
    );
    await createAppointmentNotificationForEmail({
      patientEmail: appointment.email,
      type: NotificationType.REFUND_FAILED,
      title: "Refund failed",
      message: `We could not process the refund for your appointment${
        doctorDisplayName ? ` with ${doctorDisplayName}` : ""
      } on ${formattedDate} at ${formattedTime}. Our support team will resolve this shortly.`,
    });
  } catch (err) {
    console.error(
      "[webhooks] Failed to create refund-failed notification:",
      err,
    );
  }
}
