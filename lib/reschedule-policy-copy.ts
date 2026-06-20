/**
 * Reschedule rules match `RESCHEDULE_MIN_LEAD_TIME_MS` in
 * `app/api/reschedule-appointment/route.ts` and copy on the reschedule page.
 */

/** Core rule (same idea as “less than 24 hours… cancel and rebook” on /reschedule). */
export const RESCHEDULE_ONLY_MORE_THAN_24H =
  "Rescheduling is only available more than 24 hours before your appointment.";

/** Confirmation surfaces: payment success (online), clinic booking confirmed. */
export const RESCHEDULE_POLICY_CONFIRMATION_LINE = `${RESCHEDULE_ONLY_MORE_THAN_24H} If it is less than 24 hours before your visit, cancel and book again to choose a new time.`;

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
): string {
  const base =
    consultationType === "ONLINE"
      ? "Your appointment has been rescheduled. Please be available at the scheduled time. To cancel or reschedule, use the buttons below."
      : "Your appointment has been rescheduled. Please arrive a few minutes early. To cancel or reschedule, use the buttons below.";
  return `${base} ${RESCHEDULE_POLICY_CONFIRMATION_LINE}`;
}
