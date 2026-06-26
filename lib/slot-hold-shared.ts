/** Client + server: sessionStorage key for the active slot hold id. */
export const SLOT_HOLD_STORAGE_KEY = "beelinecure:slotHoldId";

/** Align with BookingSession checkout TTL (10 minutes). */
export const SLOT_HOLD_TTL_MS = 10 * 60 * 1000;

export const SLOT_NO_LONGER_AVAILABLE_MESSAGE =
  "This time slot is no longer available";

export type SlotUpdatedPayload = {
  date: string;
  time: string;
};
