/** Client + server: sessionStorage key for the active slot hold id. */
export const SLOT_HOLD_STORAGE_KEY = "beelinecure:slotHoldId";

/** Align with BookingSession checkout TTL (10 minutes). */
export const SLOT_HOLD_TTL_MS = 10 * 60 * 1000;

export const SLOT_NO_LONGER_AVAILABLE_MESSAGE =
  "This time slot is no longer available";

export const DOCTOR_TIMEZONE_CHANGED_CODE = "DOCTOR_TIMEZONE_CHANGED";

export const DOCTOR_TIMEZONE_CHANGED_MESSAGE =
  "The doctor updated their timezone, so the available times changed. We refreshed the slots. Please pick a time again.";

/** Shown on the booking review / checkout page when the session timezone is stale. */
export const DOCTOR_TIMEZONE_CHANGED_REVIEW_MESSAGE =
  "The doctor updated their timezone. Please go back and choose a new time.";

export function doctorTimezoneMismatchMessage(
  currentDoctorTimezone: string,
  appointmentTimezone: string,
): string {
  return `The doctor has updated their timezone to ${currentDoctorTimezone} (this appointment was booked in the ${appointmentTimezone} timezone). The times below are shown in the doctor's current timezone and may look different from when you originally booked.`;
}

export function doctorTimezoneChangedBannerMessage(
  oldTimezone: string,
  newTimezone: string,
): string {
  return `The doctor changed their timezone from ${oldTimezone} to ${newTimezone}. Available times were refreshed. Please pick a time again.`;
}

/** Shown on patient reschedule when the doctor changes timezone live or at commit. */
export const DOCTOR_TIMEZONE_CHANGED_RESCHEDULE_MESSAGE =
  "The doctor changed their practice timezone. Your appointment will be cancelled shortly. If you still need a visit, please book a new appointment from the doctor's page.";

export function doctorTimezoneChangedRescheduleBannerMessage(
  oldTimezone: string,
  newTimezone: string,
): string {
  return `The doctor changed their timezone from ${oldTimezone} to ${newTimezone}. Your appointment will be cancelled shortly. If you still need a visit, please book a new appointment from the doctor's page.`;
}

/** Shown on admin reschedule when the doctor changes timezone live or at commit. */
export const DOCTOR_TIMEZONE_CHANGED_RESCHEDULE_ADMIN_MESSAGE =
  "The doctor changed their practice timezone. This appointment will be cancelled shortly. The patient will need to book a new appointment.";

export function doctorTimezoneChangedRescheduleAdminBannerMessage(
  oldTimezone: string,
  newTimezone: string,
): string {
  return `The doctor changed their timezone from ${oldTimezone} to ${newTimezone}. This appointment will be cancelled shortly. The patient will need to book a new appointment.`;
}

export type SlotUpdatedPayload = {
  date: string;
  time: string;
};
