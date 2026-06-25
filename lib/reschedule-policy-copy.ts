/**
 * Reschedule rules match `RESCHEDULE_MIN_LEAD_TIME_MS` in
 * `lib/appointment-reschedule-eligibility.ts` and copy on the reschedule page.
 */

import type { RescheduleInitiator } from "@/lib/appointment-reschedule-eligibility";

export type { RescheduleInitiator };

/** Core rule (same idea as “less than 24 hours… cancel and rebook” on /reschedule). */
export const RESCHEDULE_ONLY_MORE_THAN_24H =
  "Rescheduling is only available more than 24 hours before your appointment.";

/** Confirmation surfaces: payment success (online), clinic booking confirmed. */
export const RESCHEDULE_POLICY_CONFIRMATION_LINE = `${RESCHEDULE_ONLY_MORE_THAN_24H} If it is less than 24 hours before your visit, cancel and book again to choose a new time.`;

/** When patients can reschedule (timing) — used on pre/post-booking UI. */
export const RESCHEDULE_POLICY_TIMING_LINE = RESCHEDULE_POLICY_CONFIRMATION_LINE;

/** Where to reschedule after booking — same for online, clinic paid, clinic unpaid. */
export const RESCHEDULE_POLICY_HOW_TO_LINE =
  "After your appointment is confirmed, reschedule from the Reschedule link in your confirmation email, or sign in to your appointments dashboard at /patient/appointments (use the same email you used when booking).";

/** Footer for pre/post-booking reschedule policy UI. */
export const RESCHEDULE_POLICY_APPLIES_TO_LINE =
  "This applies to online and clinic appointments, whether you pay online or at the clinic.";

/** Body text for the ~26h email reminder (paired with `reminderAtMsFromPatientLocal`). */
export const APPOINTMENT_REMINDER_EMAIL_BODY_26H =
  "Your appointment is coming up! Check your details below. If you need to reschedule, now is the time — this option closes 24 hours before your visit.";

/** Initial booking confirmation emails (matches EmailTemplate default wording + policy). */
export function bookingConfirmationEmailMessage(
  consultationType: "CLINIC" | "ONLINE",
): string {
  const base =
    consultationType === "ONLINE"
      ? "Your online appointment is confirmed. Please be available at the scheduled time. To cancel or reschedule, use the buttons below."
      : "Your appointment is confirmed. Please arrive a few minutes early. To cancel or reschedule, use the buttons below.";
  return `${base} ${RESCHEDULE_POLICY_CONFIRMATION_LINE}`;
}

/** After reschedule: same policy reminder with rescheduled copy. */
export function rescheduleConfirmationEmailMessage(
  consultationType: "CLINIC" | "ONLINE",
  initiatedBy: RescheduleInitiator = "patient",
): string {
  const base =
    initiatedBy === "admin"
      ? consultationType === "ONLINE"
        ? "Our team rescheduled your appointment on your behalf. Please be available at the new scheduled time. To cancel or reschedule, use the buttons below."
        : "Our team rescheduled your appointment on your behalf. Please arrive a few minutes early for your new time. To cancel or reschedule, use the buttons below."
      : consultationType === "ONLINE"
        ? "You rescheduled your appointment. Please be available at the scheduled time. To cancel or reschedule, use the buttons below."
        : "You rescheduled your appointment. Please arrive a few minutes early. To cancel or reschedule, use the buttons below.";
  return `${base} ${RESCHEDULE_POLICY_CONFIRMATION_LINE}`;
}
