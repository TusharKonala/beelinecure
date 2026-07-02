import { getAppointmentStartMsFromParts } from "@/lib/appointment-reschedule-eligibility";

export type SlotInstantRef = {
  doctorDate: string;
  startTime: string;
};

export type AppointmentInstantRef = {
  id?: string;
  date: string | Date;
  time: string;
  timezone: string;
};

function dateParamFromRef(date: string | Date): string {
  return typeof date === "string" ? date : date.toISOString().slice(0, 10);
}

export function appointmentInstantMs(
  appointment: AppointmentInstantRef,
): number {
  return getAppointmentStartMsFromParts(
    dateParamFromRef(appointment.date),
    appointment.time,
    appointment.timezone,
  );
}

export function slotInstantMs(
  slot: SlotInstantRef,
  doctorTimezone: string,
): number {
  return getAppointmentStartMsFromParts(
    slot.doctorDate,
    slot.startTime,
    doctorTimezone,
  );
}

export function isSlotInstantBookedByAppointment(
  slot: SlotInstantRef,
  doctorTimezone: string,
  appointment: AppointmentInstantRef,
): boolean {
  return (
    slotInstantMs(slot, doctorTimezone) === appointmentInstantMs(appointment)
  );
}

export function isSlotBookedByAnyAppointment(
  slot: SlotInstantRef,
  doctorTimezone: string,
  appointments: AppointmentInstantRef[],
  options?: { excludeAppointmentId?: string },
): boolean {
  const slotMs = slotInstantMs(slot, doctorTimezone);
  for (const appointment of appointments) {
    if (
      options?.excludeAppointmentId &&
      appointment.id === options.excludeAppointmentId
    ) {
      continue;
    }
    if (appointmentInstantMs(appointment) === slotMs) {
      return true;
    }
  }
  return false;
}
