import { AppointmentStatus } from "@/generated/prisma/client";
import { fromZonedTime } from "date-fns-tz";

export const RESCHEDULE_MIN_LEAD_TIME_MS = 24 * 60 * 60 * 1000;

export type RescheduleInitiator = "patient" | "admin";

export type RescheduleEligibilityCode =
  | "eligible"
  | "missing_tokens"
  | "cancelled"
  | "completed"
  | "appointment_passed"
  | "too_close_to_reschedule";

export type AppointmentRescheduleEligibilityInput = {
  status: AppointmentStatus;
  date: Date;
  time: string;
  timezone: string;
  cancelToken?: string | null;
  rescheduleToken?: string | null;
};

export function getAppointmentStartMs(
  date: Date,
  time: string,
  timezone: string,
): number {
  const dateParam = date.toISOString().slice(0, 10);
  return getAppointmentStartMsFromParts(dateParam, time, timezone);
}

export function getAppointmentStartMsFromParts(
  dateParam: string,
  time: string,
  timezone: string,
): number {
  const timeWithSeconds = time.length === 5 ? `${time}:00` : time;
  return fromZonedTime(`${dateParam}T${timeWithSeconds}`, timezone).getTime();
}

export function evaluateRescheduleEligibility(
  appointment: AppointmentRescheduleEligibilityInput,
  options?: {
    requireTokens?: boolean;
    nowMs?: number;
  },
): RescheduleEligibilityCode {
  const nowMs = options?.nowMs ?? Date.now();
  const requireTokens = options?.requireTokens ?? true;

  if (appointment.status === AppointmentStatus.CANCELLED) {
    return "cancelled";
  }
  if (appointment.status === AppointmentStatus.COMPLETED) {
    return "completed";
  }
  if (
    requireTokens &&
    (!appointment.cancelToken?.trim() || !appointment.rescheduleToken?.trim())
  ) {
    return "missing_tokens";
  }

  const startMs = getAppointmentStartMs(
    appointment.date,
    appointment.time,
    appointment.timezone,
  );
  if (startMs <= nowMs) {
    return "appointment_passed";
  }
  if (startMs - nowMs < RESCHEDULE_MIN_LEAD_TIME_MS) {
    return "too_close_to_reschedule";
  }
  return "eligible";
}

export function isAppointmentReschedulable(
  appointment: AppointmentRescheduleEligibilityInput,
  options?: {
    requireTokens?: boolean;
    nowMs?: number;
  },
): boolean {
  return evaluateRescheduleEligibility(appointment, options) === "eligible";
}

/** Client-side helper when only YYYY-MM-DD date string is available (admin list). */
export function isAppointmentReschedulableFromParts(input: {
  status: AppointmentStatus | string;
  dateParam: string;
  time: string;
  timezone: string;
  nowMs?: number;
}): boolean {
  if (input.status === AppointmentStatus.CANCELLED) return false;
  if (input.status === AppointmentStatus.COMPLETED) return false;
  const nowMs = input.nowMs ?? Date.now();
  const startMs = getAppointmentStartMsFromParts(
    input.dateParam,
    input.time,
    input.timezone,
  );
  if (startMs <= nowMs) return false;
  return startMs - nowMs >= RESCHEDULE_MIN_LEAD_TIME_MS;
}
