import { fromZonedTime } from "date-fns-tz";

const MS_PER_DAY = 86_400_000;

/** Extract YYYY-MM-DD for an instant in an IANA timezone. */
export function ymdInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Calendar "today" in an IANA timezone (YYYY-MM-DD). */
export function todayYmdInTimeZone(timeZone: string): string {
  return ymdInTimeZone(new Date(), timeZone);
}

/** Map a doctor-local slot to the patient's calendar day (YYYY-MM-DD). */
export function doctorSlotToPatientLocalYmd(
  doctorDate: string,
  timeStr: string,
  doctorTimezone: string,
  patientTimezone: string,
): string {
  const utc = doctorLocalToUtc(doctorDate, timeStr, doctorTimezone);
  return ymdInTimeZone(utc, patientTimezone);
}

/**
 * Doctor-local date range that may contain slots falling on any patient-local
 * day within [patientFrom, patientTo] (inclusive). Padded ±1 day for midnight crossings.
 */
export function doctorDateRangeCoveringPatientRange(
  patientFrom: string,
  patientTo: string,
  patientTimezone: string,
  doctorTimezone: string,
): { min: string; max: string } {
  const startUtc = fromZonedTime(`${patientFrom}T00:00:00`, patientTimezone);
  const endUtc = fromZonedTime(`${patientTo}T23:59:59`, patientTimezone);
  const paddedStart = new Date(startUtc.getTime() - MS_PER_DAY);
  const paddedEnd = new Date(endUtc.getTime() + MS_PER_DAY);
  return {
    min: ymdInTimeZone(paddedStart, doctorTimezone),
    max: ymdInTimeZone(paddedEnd, doctorTimezone),
  };
}

/**
 * Convert a doctor-local date + time to the browser's local timezone.
 * Returns a UTC Date whose .getTime() is the true instant.
 */
export function doctorLocalToUtc(
  dateStr: string,
  timeStr: string,
  doctorTimezone: string,
): Date {
  const seconds = timeStr.length === 5 ? ":00" : "";
  return fromZonedTime(`${dateStr}T${timeStr}${seconds}`, doctorTimezone);
}

/**
 * Format a doctor-local time as a display string in the patient's timezone.
 * On the client, omit `patientTimezone` to use the browser default.
 * On the server (emails), pass it explicitly.
 */
export function formatTimeInPatientTz(
  dateStr: string,
  timeStr: string,
  doctorTimezone: string,
  patientTimezone?: string,
): string {
  const utcDate = doctorLocalToUtc(dateStr, timeStr, doctorTimezone);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(patientTimezone ? { timeZone: patientTimezone } : {}),
  }).format(utcDate);
}

/**
 * Format a doctor-local date as a display string in the patient's timezone.
 * On the client, omit `patientTimezone` to use the browser default.
 * On the server (emails), pass it explicitly.
 */
export function formatDateInPatientTz(
  dateStr: string,
  timeStr: string,
  doctorTimezone: string,
  patientTimezone?: string,
): string {
  const utcDate = doctorLocalToUtc(dateStr, timeStr, doctorTimezone);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(patientTimezone ? { timeZone: patientTimezone } : {}),
  }).format(utcDate);
}

/**
 * Format a doctor-local date directly for doctor-facing UI.
 * This intentionally does not convert across timezones.
 */
export function formatDateInDoctorTz(
  dateStr: string,
  timeStr: string,
  doctorTimezone: string,
): string {
  void timeStr;
  void doctorTimezone;
  const [y, m, d] = dateStr.split("-").map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return dateStr;
  }

  // Use UTC to preserve the exact calendar date label without timezone shifts.
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
}

/**
 * Format a doctor-local time directly for doctor-facing UI.
 * This intentionally does not convert across timezones.
 */
export function formatTimeInDoctorTz(
  _dateStr: string,
  timeStr: string,
  doctorTimezone: string,
): string {
  void doctorTimezone;
  const [hourRaw, minuteRaw] = timeStr.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return timeStr;
  }

  const normalizedHour = ((hour % 24) + 24) % 24;
  const period = normalizedHour >= 12 ? "PM" : "AM";
  const hour12 = normalizedHour % 12 || 12;
  const minuteLabel = String(minute).padStart(2, "0");
  return `${hour12}:${minuteLabel} ${period}`;
}

/**
 * Returns true if `timeZone` is a valid IANA time zone for Intl (e.g. for query params).
 */
export function isValidIanaTimeZone(timeZone: string): boolean {
  const trimmed = timeZone.trim();
  if (!trimmed) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a doctor-local appointment time is in the past.
 */
export function isDoctorTimeInPast(
  dateStr: string,
  timeStr: string,
  doctorTimezone: string,
): boolean {
  return doctorLocalToUtc(dateStr, timeStr, doctorTimezone).getTime() <= Date.now();
}

/**
 * Doctor-local slot start is in the past (inclusive of the exact start instant).
 * This is the canonical server-side gate for "past slot" acceptance.
 */
export function isDoctorSlotInPast(
  doctorDateYmd: string,
  time: string,
  doctorTimezone: string,
): boolean {
  return isDoctorTimeInPast(doctorDateYmd, time, doctorTimezone);
}

/**
 * Shared error message returned when a slot is no longer bookable.
 * Keep this string stable so client-side UIs don't need special casing.
 */
export const PAST_OR_UNAVAILABLE_SLOT_MESSAGE =
  "This time slot is no longer available";
