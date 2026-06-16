import { coerceAllowedSlotDurationMinutes } from "@/lib/doctor-availability-slots";
import { isDoctorTimeInPast } from "@/lib/timezone-display";

export type RescheduleSlotConsultationType = "CLINIC" | "ONLINE" | "BOTH";
export type BookedConsultationType = "CLINIC" | "ONLINE";

export type BookableSlotRef = { doctorDate: string; startTime: string };

export function bookableSlotRefKey(ref: BookableSlotRef): string {
  return `${ref.doctorDate}:${ref.startTime}`;
}

export type RescheduleSlotDetail = {
  doctorDate?: string;
  startTime: string;
  slotDurationMinutes: number;
  consultationType?: RescheduleSlotConsultationType;
};

/**
 * Slot starts that match the originally booked duration AND consultation type
 * (a slot with `consultationType: "BOTH"` always matches), excluding times
 * already past in the doctor's timezone.
 */
export function filterReschedulableSlots(args: {
  slotDetails: RescheduleSlotDetail[];
  bookedDurationMinutes: number;
  bookedConsultationType: BookedConsultationType;
  /** Fallback doctor-local date when slot detail omits `doctorDate` (admin mode). */
  selectedDate: string;
  doctorTimezone: string;
}): BookableSlotRef[] {
  const booked = coerceAllowedSlotDurationMinutes(args.bookedDurationMinutes);
  const seen = new Set<string>();
  const out: BookableSlotRef[] = [];
  for (const detail of args.slotDetails) {
    if (detail.slotDurationMinutes !== booked) continue;
    const slotType = detail.consultationType ?? "BOTH";
    if (slotType !== "BOTH" && slotType !== args.bookedConsultationType) {
      continue;
    }
    const doctorDate = detail.doctorDate ?? args.selectedDate;
    const key = bookableSlotRefKey({ doctorDate, startTime: detail.startTime });
    if (seen.has(key)) continue;
    if (isDoctorTimeInPast(doctorDate, detail.startTime, args.doctorTimezone)) {
      continue;
    }
    seen.add(key);
    out.push({ doctorDate, startTime: detail.startTime });
  }
  return out.sort((a, b) =>
    a.doctorDate === b.doctorDate
      ? a.startTime.localeCompare(b.startTime)
      : a.doctorDate.localeCompare(b.doctorDate),
  );
}
