/** Client + server: sessionStorage key for the active slot hold id. */
export const SLOT_HOLD_STORAGE_KEY = "beelinecure:slotHoldId";

/** Align with BookingSession checkout TTL (10 minutes). */
export const SLOT_HOLD_TTL_MS = 10 * 60 * 1000;

export const SLOT_NO_LONGER_AVAILABLE_MESSAGE =
  "This time slot is no longer available";

export const DOCTOR_TIMEZONE_CHANGED_CODE = "DOCTOR_TIMEZONE_CHANGED";

export const DOCTOR_TIMEZONE_CHANGED_MESSAGE =
  "The doctor updated their timezone, so the available times changed. We refreshed the slots. Please pick a time again.";

export function doctorTimezoneMismatchMessage(
  currentDoctorTimezone: string,
  appointmentTimezone: string,
): string {
  return `This doctor now uses ${currentDoctorTimezone}. This appointment was booked in ${appointmentTimezone}, so the available times below may look different from when you originally booked.`;
}

export type SlotUpdatedPayload = {
  date: string;
  time: string;
};
