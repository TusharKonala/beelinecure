import "server-only";

import {
  ConsultationType,
  PaymentStatus,
  RefundStatus,
} from "@/generated/prisma/client";
import {
  coerceSupportedCurrency,
  currencyForTimezone,
  formatPrice,
  type SupportedCurrency,
} from "@/lib/currency";
import { convertCentsAmount } from "@/lib/fx-rates";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

/**
 * Minimal shape of an Appointment row that the refund helpers need.
 * We accept this projection so callers can `select` only what's required.
 */
export type RefundableAppointment = {
  id: string;
  consultationType: ConsultationType;
  paymentStatus: PaymentStatus;
  stripePaymentId: string | null;
  stripePaymentIntentId: string | null;
  refundStatus: RefundStatus | null;
};

/**
 * Return the cached PaymentIntent id, or retrieve it from the stored
 * checkout session (cs_xxx) and persist it back onto the appointment
 * so subsequent calls don't re-hit Stripe.
 */
export async function resolvePaymentIntentId(
  appointment: RefundableAppointment,
): Promise<string | null> {
  if (appointment.stripePaymentIntentId) {
    return appointment.stripePaymentIntentId;
  }
  if (!appointment.stripePaymentId) {
    return null;
  }

  const session = await stripe.checkout.sessions.retrieve(
    appointment.stripePaymentId,
  );
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  if (!paymentIntentId) return null;

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { stripePaymentIntentId: paymentIntentId },
  });

  return paymentIntentId;
}

/**
 * Fetch the amount actually charged (in cents) for a payment intent,
 * so 50% refunds stay correct even if pricing changes later.
 */
export async function getChargeAmountCents(
  paymentIntentId: string,
): Promise<number | null> {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent.amount_received || paymentIntent.amount || null;
}

export type InitiateRefundResult =
  | {
      ok: true;
      refundAmountCents: number;
      percentage: 100 | 50;
      /** Currency of the Stripe charge/refund (patient's payment currency). */
      paymentCurrency: SupportedCurrency;
    }
  | {
      ok: false;
      reason:
        | "not_online"
        | "not_paid"
        | "already_refunded"
        | "missing_payment_intent"
        | "missing_amount"
        | "stripe_error";
      error?: unknown;
    };

type InitiateRefundInput = {
  appointment: RefundableAppointment;
  percentage: 100 | 50;
};

export type CancellationRefundPolicyTier =
  | "full_refund"
  | "partial_refund"
  | "no_refund_no_show";

export type CancellationRefundPolicy = {
  tier: CancellationRefundPolicyTier;
  percentage: 100 | 50 | 0;
  title: string;
  description: string;
};

/**
 * Maps the time until appointment start to the cancellation refund policy.
 */
export function cancellationRefundPolicy(
  appointmentStartMs: number,
  nowMs = Date.now(),
): CancellationRefundPolicy {
  const hoursUntilStart = (appointmentStartMs - nowMs) / (60 * 60 * 1000);

  if (hoursUntilStart >= 24) {
    return {
      tier: "full_refund",
      percentage: 100,
      title: "Full refund",
      description:
        "Cancel 24 or more hours before your appointment to receive a full refund.",
    };
  }

  if (hoursUntilStart > 0) {
    return {
      tier: "partial_refund",
      percentage: 50,
      title: "50% refund",
      description:
        "Cancelling within 24 hours of your appointment is eligible for a 50% refund.",
    };
  }

  return {
    tier: "no_refund_no_show",
    percentage: 0,
    title: "No refund",
    description:
      "No-shows or cancellations after the appointment start time are not eligible for a refund.",
  };
}

export type PatientCancelRefundEmailTier = "full_refund" | "partial_refund";

function cancellationRefundEmailLeadIn(
  tier: PatientCancelRefundEmailTier,
): string {
  if (tier === "full_refund") {
    return "Because this appointment was cancelled at least 24 hours before the scheduled start time,";
  }
  return "Because this appointment was cancelled within 24 hours of the scheduled start time,";
}

/**
 * Creates a Stripe refund for a paid appointment and records
 * the refund lifecycle state on the appointment row.
 *
 * Guards:
 *   - Only PAID appointments can be refunded.
 *   - A refund is only initiated once (refundStatus must be null).
 */
export async function initiateRefund({
  appointment,
  percentage,
}: InitiateRefundInput): Promise<InitiateRefundResult> {
  if (appointment.paymentStatus !== PaymentStatus.PAID) {
    return { ok: false, reason: "not_paid" };
  }
  if (appointment.refundStatus !== null) {
    return { ok: false, reason: "already_refunded" };
  }

  const paymentIntentId = await resolvePaymentIntentId(appointment);
  if (!paymentIntentId) {
    return { ok: false, reason: "missing_payment_intent" };
  }

  let refundAmountCents: number | undefined;
  if (percentage === 50) {
    const chargeCents = await getChargeAmountCents(paymentIntentId);
    if (!chargeCents) {
      return { ok: false, reason: "missing_amount" };
    }
    refundAmountCents = Math.floor(chargeCents / 2);
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(refundAmountCents !== undefined
        ? { amount: refundAmountCents }
        : {}),
      metadata: {
        appointmentId: appointment.id,
        refundPercentage: String(percentage),
      },
    });

    const persistedAmount =
      refundAmountCents ?? refund.amount ?? 0;

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        stripeRefundId: refund.id,
        refundStatus: RefundStatus.PENDING,
        refundAmountCents: persistedAmount,
      },
    });

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paymentCurrency = coerceSupportedCurrency(
      refund.currency ?? paymentIntent.currency,
    );

    return {
      ok: true,
      refundAmountCents: persistedAmount,
      percentage,
      paymentCurrency,
    };
  } catch (err) {
    console.error(
      "[refunds] stripe.refunds.create failed for appointment",
      appointment.id,
      err,
    );
    return { ok: false, reason: "stripe_error", error: err };
  }
}

/**
 * Human-readable refund sentence for cancellation emails and in-app messages.
 * Amounts are always in Stripe payment currency; when that differs from the
 * patient's local currency (from `patientTimezone`), appends the same
 * `(approx …)` pattern as `buildEmailPriceLabels` in `email-price-labels.ts`.
 */
export async function formatRefundEmailSentence(
  result: InitiateRefundResult,
  patientTimezone: string | null | undefined,
  policyTier?: PatientCancelRefundEmailTier,
): Promise<string | null> {
  if (!result.ok) return null;

  const payCur = result.paymentCurrency;
  const paymentPart = formatPrice(result.refundAmountCents, payCur);

  let amountPhrase: string;
  if (!patientTimezone) {
    amountPhrase = paymentPart;
  } else {
    const patientCurrency = currencyForTimezone(patientTimezone);
    if (patientCurrency === payCur) {
      amountPhrase = paymentPart;
    } else {
      try {
        const localCents = await convertCentsAmount(
          result.refundAmountCents,
          payCur,
          patientCurrency,
        );
        amountPhrase = `${paymentPart} (approx ${formatPrice(localCents, patientCurrency)})`;
      } catch (err) {
        console.error("[refunds] FX for refund sentence failed:", err);
        amountPhrase = paymentPart;
      }
    }
  }

  const refundTiming =
    " has been initiated and should appear on your original payment method within 5-10 business days.";

  if (result.percentage === 100) {
    if (policyTier === "full_refund") {
      return `${cancellationRefundEmailLeadIn(policyTier)} a full refund of ${amountPhrase}${refundTiming}`;
    }
    return `A full refund of ${amountPhrase}${refundTiming}`;
  }
  if (policyTier === "partial_refund") {
    return `${cancellationRefundEmailLeadIn(policyTier)} a 50% refund of ${amountPhrase}${refundTiming}`;
  }
  return `Per our cancellation policy, a 50% refund of ${amountPhrase}${refundTiming}`;
}

export type RefundCheckoutSessionResult =
  | {
      ok: true;
      refundAmountCents: number;
      paymentCurrency: SupportedCurrency;
    }
  | {
      ok: false;
      reason: "missing_payment_intent" | "stripe_error";
      error?: unknown;
    };

/**
 * Full refund for a Stripe checkout session when no appointment row exists
 * (e.g. slot taken by another patient during concurrent checkout).
 */
export async function refundCheckoutSession(input: {
  checkoutSessionId: string;
  bookingSessionId: string;
  reason: string;
}): Promise<RefundCheckoutSessionResult> {
  const session = await stripe.checkout.sessions.retrieve(
    input.checkoutSessionId,
  );
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  if (!paymentIntentId) {
    return { ok: false, reason: "missing_payment_intent" };
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      metadata: {
        bookingSessionId: input.bookingSessionId,
        reason: input.reason,
      },
    });

    const paymentIntent =
      await stripe.paymentIntents.retrieve(paymentIntentId);
    const paymentCurrency = coerceSupportedCurrency(
      refund.currency ?? paymentIntent.currency,
    );

    return {
      ok: true,
      refundAmountCents: refund.amount ?? 0,
      paymentCurrency,
    };
  } catch (err) {
    console.error(
      "[refunds] refundCheckoutSession failed for bookingSession",
      input.bookingSessionId,
      err,
    );
    return { ok: false, reason: "stripe_error", error: err };
  }
}
