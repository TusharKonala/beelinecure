import { getAppointmentStartMsFromParts } from "@/lib/appointment-reschedule-eligibility";
import { coerceAllowedSlotDurationMinutes } from "@/lib/doctor-availability-slots";
import { isDoctorTimeInPast } from "@/lib/timezone-display";

export type RescheduleSlotConsultationType = "CLINIC" | "ONLINE" | "BOTH";
export type BookedConsultationType = "CLINIC" | "ONLINE";

export type BookableSlotRef = { doctorDate: string; startTime: string };

export function bookableSlotRefKey(ref: BookableSlotRef): string {
  return `${ref.doctorDate}:${ref.startTime}`;
}

/**
 * True when a grid slot and a stored appointment refer to the same instant.
 * Slot coords use the doctor's current timezone; booked coords use the
 * appointment's booking-time timezone (they differ after a doctor TZ change).
 */
export function isSameAppointmentInstant(
  slot: BookableSlotRef,
  slotDoctorTimezone: string,
  booked: { date: string; time: string; timezone: string },
): boolean {
  return (
    getAppointmentStartMsFromParts(
      slot.doctorDate,
      slot.startTime,
      slotDoctorTimezone,
    ) ===
    getAppointmentStartMsFromParts(
      booked.date,
      booked.time,
      booked.timezone,
    )
  );
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
