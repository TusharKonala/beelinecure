import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * 26h before appointment start in UTC ms (doctor-local wall clock + IANA timezone).
 * Sends early enough that patients still have ~2h before the 24h reschedule cutoff
 * enforced by `reschedule-appointment`.
 */
export function reminderAtMsFromPatientLocal(
  dateParam: string,
  time: string,
  timeZone: string,
): number | null {
  const utcDate = fromZonedTime(`${dateParam}T${time}:00`, timeZone);
  const target = utcDate.getTime() - 26 * 60 * 60 * 1000;
  if (target <= Date.now()) return null;
  return target;
}

/** 15 minutes before appointment start in UTC ms — used for online "join now" reminders. */
export function onlineT15ReminderAtMs(
  dateParam: string,
  time: string,
  timeZone: string,
): number | null {
  const utcDate = fromZonedTime(`${dateParam}T${time}:00`, timeZone);
  const target = utcDate.getTime() - 15 * 60 * 1000;
  if (target <= Date.now()) return null;
  return target;
}

/** 2 hours before appointment start in UTC ms — used for in-clinic "head out" reminders. */
export function clinicT120ReminderAtMs(
  dateParam: string,
  time: string,
  timeZone: string,
): number | null {
  const utcDate = fromZonedTime(`${dateParam}T${time}:00`, timeZone);
  const target = utcDate.getTime() - 120 * 60 * 1000;
  if (target <= Date.now()) return null;
  return target;
}

/** Appointment start time in UTC ms — used to notify doctor when slot begins. */
export function appointmentStartAtMs(
  dateParam: string,
  time: string,
  timeZone: string,
): number | null {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const utcDate = fromZonedTime(`${dateParam}T${normalizedTime}`, timeZone);
  const target = utcDate.getTime();
  if (target <= Date.now()) return null;
  return target;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function timestampFromLocalParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string,
): number | null {
  const localIso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(
    second,
  )}`;
  const utcDate = fromZonedTime(localIso, timezone);
  const ts = utcDate.getTime();
  return ts > Date.now() ? ts : null;
}

/**
 * Computes delayed reminder timestamps using patient-local date/time clock captured at save-time.
 * Halfway uses floor(courseDays / 2), with minimum 1 only when courseDays > 1.
 */
export function prescriptionReminderTsFromSavedAt(
  savedAt: Date,
  patientTimezone: string,
  courseDays: number,
): { halfwayTs: number | null; completedTs: number | null } {
  if (!Number.isInteger(courseDays) || courseDays <= 0) {
    return { halfwayTs: null, completedTs: null };
  }

  const patientNow = toZonedTime(savedAt, patientTimezone);
  const year = patientNow.getFullYear();
  const month = patientNow.getMonth() + 1;
  const day = patientNow.getDate();
  const hour = patientNow.getHours();
  const minute = patientNow.getMinutes();
  const second = patientNow.getSeconds();

  const halfwayOffsetDays =
    courseDays > 1 ? Math.max(1, Math.floor(courseDays / 2)) : Math.floor(courseDays / 2);
  const completedOffsetDays = courseDays;

  const halfwayLocal = new Date(Date.UTC(year, month - 1, day + halfwayOffsetDays, hour, minute, second));
  const completedLocal = new Date(
    Date.UTC(year, month - 1, day + completedOffsetDays, hour, minute, second),
  );

  const halfwayTs = timestampFromLocalParts(
    halfwayLocal.getUTCFullYear(),
    halfwayLocal.getUTCMonth() + 1,
    halfwayLocal.getUTCDate(),
    hour,
    minute,
    second,
    patientTimezone,
  );
  const completedTs = timestampFromLocalParts(
    completedLocal.getUTCFullYear(),
    completedLocal.getUTCMonth() + 1,
    completedLocal.getUTCDate(),
    hour,
    minute,
    second,
    patientTimezone,
  );

  return { halfwayTs, completedTs };
}

/** 24 hours before interview start (UTC instant). */
export function interviewReminder24hAtMs(scheduledAt: Date): number | null {
  const target = scheduledAt.getTime() - 24 * 60 * 60 * 1000;
  if (target <= Date.now()) return null;
  return target;
}

/** 30 minutes before interview start (UTC instant). */
export function interviewReminder30mAtMs(scheduledAt: Date): number | null {
  const target = scheduledAt.getTime() - 30 * 60 * 1000;
  if (target <= Date.now()) return null;
  return target;
}
