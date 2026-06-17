import "server-only";

import { PaymentStatus } from "@/generated/prisma/client";
import { fromZonedTime } from "date-fns-tz";
import {
  cancellationRefundPolicy,
  getChargeAmountCents,
  resolvePaymentIntentId,
  type CancellationRefundPolicy,
  type RefundableAppointment,
} from "@/lib/refunds";

export type RefundPreview = {
  tier: CancellationRefundPolicy["tier"];
  percentage: CancellationRefundPolicy["percentage"];
  title: string;
  description: string;
  originalPaidAmountCents: number | null;
  eligibleRefundAmountCents: number | null;
  /** ISO 4217 currency code the original payment was charged in. */
  currency: string | null;
};

type AppointmentForRefundPreview = RefundableAppointment & {
  date: Date;
  time: string;
  timezone: string;
  currencyAtBooking: string | null;
};

export type StaffCancelReason = "patient_no_show" | "doctor_unavailable" | null;

async function resolvePaidAmounts(
  appointment: AppointmentForRefundPreview,
  percentage: CancellationRefundPolicy["percentage"],
): Promise<{
  originalPaidAmountCents: number | null;
  eligibleRefundAmountCents: number | null;
}> {
  let originalPaidAmountCents: number | null = null;
  let eligibleRefundAmountCents: number | null = null;
  const paymentIntentId = await resolvePaymentIntentId(appointment);
  if (paymentIntentId) {
    originalPaidAmountCents = await getChargeAmountCents(paymentIntentId);
    if (originalPaidAmountCents) {
      eligibleRefundAmountCents = Math.floor(
        (originalPaidAmountCents * percentage) / 100,
      );
    }
  }
  return { originalPaidAmountCents, eligibleRefundAmountCents };
}

/**
 * Refund preview for doctor/admin cancellations. Matches
 * `cancelAppointmentByStaff`: full refund unless reason is patient_no_show.
 */
export async function getStaffRefundPreviewForAppointment(
  appointment: AppointmentForRefundPreview,
  reason: StaffCancelReason,
): Promise<RefundPreview | null> {
  if (appointment.paymentStatus !== PaymentStatus.PAID) {
    return null;
  }

  if (reason === "patient_no_show") {
    const { originalPaidAmountCents, eligibleRefundAmountCents } =
      await resolvePaidAmounts(appointment, 0);
    return {
      tier: "no_refund_no_show",
      percentage: 0,
      title: "No refund",
      description: "Cancelled as patient no-show — not eligible for a refund.",
      originalPaidAmountCents,
      eligibleRefundAmountCents,
      currency: appointment.currencyAtBooking ?? null,
    };
  }

  const { originalPaidAmountCents, eligibleRefundAmountCents } =
    await resolvePaidAmounts(appointment, 100);

  const description =
    reason === "doctor_unavailable"
      ? "Doctor was unavailable — patient receives a full refund."
      : "Staff-initiated cancellation — patient receives a full refund.";

  return {
    tier: "full_refund",
    percentage: 100,
    title: "Full refund",
    description,
    originalPaidAmountCents,
    eligibleRefundAmountCents,
    currency: appointment.currencyAtBooking ?? null,
  };
}

/**
 * Computes the refund preview for an appointment: tier, percentage, original
 * paid amount, and eligible refund amount. Returns null when the appointment
 * isn't eligible for any refund (unpaid).
 */
export async function getRefundPreviewForAppointment(
  appointment: AppointmentForRefundPreview,
  nowMs = Date.now(),
): Promise<RefundPreview | null> {
  if (appointment.paymentStatus !== PaymentStatus.PAID) {
    return null;
  }

  const dateParam = appointment.date.toISOString().slice(0, 10);
  const timeWithSeconds =
    appointment.time.length === 5 ? `${appointment.time}:00` : appointment.time;
  const appointmentStartMs = fromZonedTime(
    `${dateParam}T${timeWithSeconds}`,
    appointment.timezone,
  ).getTime();

  const policy = cancellationRefundPolicy(appointmentStartMs, nowMs);

  const { originalPaidAmountCents, eligibleRefundAmountCents } =
    await resolvePaidAmounts(appointment, policy.percentage);

  return {
    tier: policy.tier,
    percentage: policy.percentage,
    title: policy.title,
    description: policy.description,
    originalPaidAmountCents,
    eligibleRefundAmountCents,
    currency: appointment.currencyAtBooking ?? null,
  };
}
