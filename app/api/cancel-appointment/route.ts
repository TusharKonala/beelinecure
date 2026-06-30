import { prisma } from "@/lib/db";
import {
  AppointmentStatus,
  ConsultationType,
  NotificationType,
  PaymentStatus,
} from "@/generated/prisma/client";
import { EmailTemplate } from "@/components/email-template";
import { cancelPendingAppointmentReminders } from "@/lib/appointment-reminder-cancel";
import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { Resend } from "resend";
import { getEmailFrom } from "@/lib/email-from";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import {
  formatDateInDoctorTz,
  formatDateInPatientTz,
  formatTimeInDoctorTz,
  formatTimeInPatientTz,
} from "@/lib/timezone-display";
import {
  createAppointmentNotificationForEmail,
  createDoctorNotificationForDoctorId,
} from "@/lib/notifications";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import {
  cancellationRefundPolicy,
  getChargeAmountCents,
  formatRefundEmailSentence,
  initiateRefund,
  resolvePaymentIntentId,
} from "@/lib/refunds";
import {
  coerceSupportedCurrency,
  currencyForTimezone,
} from "@/lib/currency";
import { convertCentsAmount } from "@/lib/fx-rates";
import { buildEmailPriceLabels } from "@/lib/email-price-labels";
import { deleteMeetCalendarEvent } from "@/lib/google-calendar-meet";
import { triggerAppointmentsChanged, triggerSlotUpdated } from "@/lib/pusher-server";

const resend = new Resend(process.env.RESEND_API_KEY);

const cancelSchema = z.object({
  appointmentId: z.string().min(1),
  token: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const appointmentId = request.nextUrl.searchParams.get("appointmentId") ?? "";
  const token = request.nextUrl.searchParams.get("token") ?? "";

  const parsed = cancelSchema.safeParse({ appointmentId, token });
  if (!parsed.success) {
    return NextResponse.json({ status: "invalid_link" as const });
  }

  const { appointmentId: validatedAppointmentId, token: validatedToken } =
    parsed.data;

  const appointment = await prisma.appointment.findUnique({
    where: { id: validatedAppointmentId },
  });

  if (
    !appointment ||
    !appointment.cancelToken ||
    appointment.cancelToken !== validatedToken
  ) {
    return NextResponse.json({ status: "invalid_link" as const });
  }

  // Disallow cancelling already-cancelled or completed appointments.
  if (appointment.status === AppointmentStatus.CANCELLED) {
    return NextResponse.json({ status: "already_cancelled" as const });
  }
  if (appointment.status === AppointmentStatus.COMPLETED) {
    return NextResponse.json({ status: "invalid_link" as const });
  }

  const appointmentDateParam = appointment.date.toISOString().slice(0, 10);
  const timeWithSeconds = appointment.time.length === 5 ? `${appointment.time}:00` : appointment.time;
  const appointmentStartMs = fromZonedTime(
    `${appointmentDateParam}T${timeWithSeconds}`,
    appointment.timezone,
  ).getTime();
  if (appointmentStartMs <= Date.now()) {
    return NextResponse.json({ status: "appointment_passed" as const });
  }
  const refundPolicy =
    appointment.paymentStatus === PaymentStatus.PAID
      ? cancellationRefundPolicy(appointmentStartMs)
      : null;
  let originalPaidAmountCents: number | null = null;
  let eligibleRefundAmountCents: number | null = null;
  if (refundPolicy) {
    const paymentIntentId = await resolvePaymentIntentId({
      id: appointment.id,
      consultationType: appointment.consultationType,
      paymentStatus: appointment.paymentStatus,
      stripePaymentId: appointment.stripePaymentId,
      stripePaymentIntentId: appointment.stripePaymentIntentId,
      refundStatus: appointment.refundStatus,
    });
    if (paymentIntentId) {
      originalPaidAmountCents = await getChargeAmountCents(paymentIntentId);
      if (originalPaidAmountCents) {
        eligibleRefundAmountCents = Math.floor(
          (originalPaidAmountCents * refundPolicy.percentage) / 100,
        );
      }
    }
  }

  // Convert the eligible refund to the patient's local currency (best-effort
  // — if FX rates aren't available, we silently skip the local approx).
  let localRefundAmountCents: number | null = null;
  let localCurrency: string | null = null;
  if (
    refundPolicy &&
    typeof eligibleRefundAmountCents === "number" &&
    appointment.currencyAtBooking
  ) {
    const baseCurrency = coerceSupportedCurrency(appointment.currencyAtBooking);
    const patientCurrency = currencyForTimezone(appointment.patientTimezone);
    if (baseCurrency !== patientCurrency) {
      try {
        localRefundAmountCents = await convertCentsAmount(
          eligibleRefundAmountCents,
          baseCurrency,
          patientCurrency,
        );
        localCurrency = patientCurrency;
      } catch (err) {
        console.error("[cancel] Failed to convert refund to local currency:", err);
      }
    }
  }

  return NextResponse.json({
    status: "valid" as const,
    refundPolicy: refundPolicy
      ? {
          tier: refundPolicy.tier,
          percentage: refundPolicy.percentage,
          title: refundPolicy.title,
          description: refundPolicy.description,
          originalPaidAmountCents,
          eligibleRefundAmountCents,
          currency: appointment.currencyAtBooking ?? null,
          localRefundAmountCents,
          localCurrency,
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "invalid_link" as const });
  }

  const { appointmentId, token } = parsed.data;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment || !appointment.cancelToken || appointment.cancelToken !== token) {
    return NextResponse.json({ status: "invalid_link" as const });
  }

  // Disallow cancelling already-cancelled or completed appointments.
  if (appointment.status === AppointmentStatus.CANCELLED) {
    return NextResponse.json({ status: "already_cancelled" as const });
  }
  if (appointment.status === AppointmentStatus.COMPLETED) {
    return NextResponse.json({ status: "invalid_link" as const });
  }

  const appointmentDateParam = appointment.date.toISOString().slice(0, 10);
  const timeWithSeconds = appointment.time.length === 5 ? `${appointment.time}:00` : appointment.time;
  const appointmentStartMs = fromZonedTime(
    `${appointmentDateParam}T${timeWithSeconds}`,
    appointment.timezone,
  ).getTime();
  if (appointmentStartMs <= Date.now()) {
    return NextResponse.json({ status: "appointment_passed" as const });
  }

  const calendarEventId = appointment.googleCalendarEventId;

  const { count } = await prisma.appointment.updateMany({
    where: {
      id: appointmentId,
      status: {
        in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
      },
    },
    data: {
      status: AppointmentStatus.CANCELLED,
      googleCalendarEventId: null,
      googleMeetUrl: null,
    },
  });
  if (count !== 1) {
    const current = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { status: true },
    });
    if (current?.status === AppointmentStatus.COMPLETED) {
      return NextResponse.json({ status: "invalid_link" as const });
    }
    return NextResponse.json({ status: "already_cancelled" as const });
  }

  if (calendarEventId) {
    await deleteMeetCalendarEvent(appointment.doctorId, calendarEventId);
  }

  const appointmentDateYmd = appointment.date.toISOString().slice(0, 10);
  await triggerSlotUpdated(appointment.doctorId, {
    date: appointmentDateYmd,
    time: appointment.time,
  });
  await triggerAppointmentsChanged(appointment.doctorId, {
    appointmentId: appointment.id,
    reason: "cancelled",
  });

  // Refund logic: paid appointments get a full refund if cancelled
  // 24+ hours before start, a 50% refund otherwise. Unpaid appointments
  // are never refunded.
  let refundSentence: string | null = null;
  let refundFailed = false;
  let noRefundSentence: string | null = null;
  const policy =
    appointment.paymentStatus === PaymentStatus.PAID
      ? cancellationRefundPolicy(appointmentStartMs)
      : null;
  if (appointment.paymentStatus === PaymentStatus.PAID) {
    if (policy?.percentage === 0) {
      noRefundSentence =
        "Per our cancellation policy, this cancellation is considered a no-show and is not eligible for a refund.";
    } else {
      const result = await initiateRefund({
        appointment: {
          id: appointment.id,
          consultationType: appointment.consultationType,
          paymentStatus: appointment.paymentStatus,
          stripePaymentId: appointment.stripePaymentId,
          stripePaymentIntentId: appointment.stripePaymentIntentId,
          refundStatus: appointment.refundStatus,
        },
        percentage: policy?.percentage === 100 ? 100 : 50,
      });
      if (result.ok) {
        const emailTier =
          policy?.tier === "full_refund" || policy?.tier === "partial_refund"
            ? policy.tier
            : undefined;
        refundSentence = await formatRefundEmailSentence(
          result,
          appointment.patientTimezone,
          emailTier,
        );
      } else if (result.reason === "stripe_error") {
        refundFailed = true;
      }
    }
  }

  const refundAppendix = refundSentence
    ? ` ${refundSentence}`
    : refundFailed
      ? " We attempted to initiate your refund but ran into an issue. Our support team will follow up shortly to resolve it."
      : noRefundSentence
        ? ` ${noRefundSentence}`
        : "";

  try {
    await cancelPendingAppointmentReminders({
      appointmentId,
      dateParam: appointmentDateParam,
      time: appointment.time,
      timezone: appointment.timezone,
      consultationType: appointment.consultationType,
    });
  } catch (err) {
    console.error("[cancel] Failed to cancel reminder:", err);
  }

  // Best-effort cancellation email; cancellation still succeeds if email fails.
  try {
    const appointmentDate = appointment.date.toISOString().slice(0, 10);
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const bookAppointmentUrl = `${origin}/book-appointment`;
    const doctor = await prisma.doctor.findUnique({
      where: { id: appointment.doctorId },
    });

    const isPaid = appointment.paymentStatus === PaymentStatus.PAID;
    // Build the cancellation message body. Paid cancellations append
    // refund policy outcomes (full/50%/no-refund) or a refund-failure sentence.
    const baseMessage =
      "Your appointment has been cancelled. If you would like to book again, please book a new appointment using the button below.";
    let refundNode: React.ReactNode = null;
    if (isPaid) {
      if (refundSentence) {
        refundNode = React.createElement(
          "span",
          { style: { display: "block", marginTop: "0.75rem" } },
          refundSentence,
        );
      } else if (refundFailed) {
        refundNode = React.createElement(
          "span",
          { style: { display: "block", marginTop: "0.75rem" } },
          "We attempted to initiate your refund but ran into an issue. Our support team will follow up shortly to resolve it.",
        );
      } else if (noRefundSentence) {
        refundNode = React.createElement(
          "span",
          { style: { display: "block", marginTop: "0.75rem" } },
          noRefundSentence,
        );
      }
    }
    const messageNode = refundNode
      ? React.createElement(React.Fragment, null, baseMessage, refundNode)
      : baseMessage;

    let priceLabel: string | null = null;
    let approxLocalPriceLabel: string | null = null;
    if (appointment.consultationType !== ConsultationType.CLINIC) {
      const labels = await buildEmailPriceLabels({
        priceCents: appointment.priceCentsAtBooking ?? null,
        baseCurrency: appointment.currencyAtBooking ?? null,
        patientTimezone: appointment.patientTimezone,
      });
      priceLabel = labels.priceLabel;
      approxLocalPriceLabel = labels.approxLocalPriceLabel;
    }

    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: appointment.email,
      subject: "Appointment Cancelled",
      react: EmailTemplate({
        heading: "Appointment Cancelled",
        message: messageNode,
        showActionLinks: true,
        primaryActionLabel: "Book appointment",
        primaryActionUrl: bookAppointmentUrl,
        secondaryActionLabel: undefined,
        secondaryActionUrl: undefined,
        doctorName: doctor?.name ?? "Your Doctor",
        appointmentDate: formatDateInPatientTz(
          appointmentDate,
          appointment.time,
          appointment.timezone,
          appointment.patientTimezone,
        ),
        appointmentTime: formatTimeInPatientTz(
          appointmentDate,
          appointment.time,
          appointment.timezone,
          appointment.patientTimezone,
        ),
        patientName: appointment.patientName,
        consultationType: appointment.consultationType,
        cancelUrl: "",
        rescheduleUrl: "",
        showOnlineContactFallback: false,
        priceLabel,
        approxLocalPriceLabel,
        durationMinutes: appointment.durationMinutes,
      }),
    });

    if (error) {
      console.error("[cancel] Cancellation email failed:", error);
    }
  } catch (err) {
    console.error("[cancel] Cancellation email failed:", err);
  }

  // Resolve the patient user id from the appointment email so we can mark them
  // as the actor — the toaster will then suppress the live toast for the
  // patient who just clicked Cancel themselves.
  const patientUser = await prisma.user.findUnique({
    where: { email: appointment.email },
    select: { id: true },
  });
  const actorUserId = patientUser?.id ?? null;

  try {
    const appointmentDate = appointment.date.toISOString().slice(0, 10);
    const doctor = await prisma.doctor.findUnique({
      where: { id: appointment.doctorId },
      select: { name: true },
    });
    const doctorDisplayName = doctor?.name
      ? formatDoctorDisplayName(doctor.name)
      : null;
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
      type: NotificationType.APPOINTMENT_CANCELLED,
      title: "Appointment cancelled",
      message: `Your appointment${
        doctorDisplayName ? ` with ${doctorDisplayName}` : ""
      } on ${formattedDate} at ${formattedTime} was cancelled.${refundAppendix}`,
      actorUserId,
    });
  } catch (err) {
    console.error("[cancel] Failed to create patient notification:", err);
  }

  try {
    const appointmentDate = appointment.date.toISOString().slice(0, 10);
    const doctorDateLabel = formatDateInDoctorTz(
      appointmentDate,
      appointment.time,
      appointment.timezone,
    );
    const doctorTimeLabel = formatTimeInDoctorTz(
      appointmentDate,
      appointment.time,
      appointment.timezone,
    );
    await createDoctorNotificationForDoctorId({
      doctorId: appointment.doctorId,
      type: NotificationType.APPOINTMENT_CANCELLED,
      title: "Appointment cancelled by patient",
      message: `${appointment.patientName} cancelled their appointment scheduled for ${doctorDateLabel} at ${doctorTimeLabel}.`,
      actorUserId,
    });
  } catch (err) {
    console.error("[cancel] Failed to create doctor notification:", err);
  }

  return NextResponse.json({ status: "success" as const });
}

