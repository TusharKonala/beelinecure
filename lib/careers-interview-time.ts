import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** IANA timezones offered in the schedule-interview form (aligned with doctor settings). */
export const INTERVIEW_TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

/** Fixed-offset or stable IANA zones where a static label is always correct. */
const IANA_TIMEZONE_ABBREVIATIONS: Record<string, string> = {
  UTC: "UTC",
  "Asia/Kolkata": "IST",
  "Asia/Dubai": "GST",
  "Asia/Singapore": "SGT",
};

/** Map normalized UTC offset keys to a common abbreviation (used when Intl returns GMT offsets). */
const OFFSET_TO_ABBREVIATION: Record<string, string> = {
  "+00:00": "GMT",
  "+01:00": "CET",
  "+02:00": "CEST",
  "+04:00": "GST",
  "+05:30": "IST",
  "+08:00": "SGT",
  "+09:00": "JST",
  "+10:00": "AEST",
  "+11:00": "AEDT",
  "-04:00": "EDT",
  "-05:00": "EST",
  "-06:00": "CST",
  "-07:00": "MST",
  "-08:00": "PST",
};

const INTL_ABBREV_LOCALES = ["en-US", "en-GB", "en-AU", "en-IN"] as const;

export function defaultInterviewTimezone(): string {
  if (typeof Intl !== "undefined") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  }
  return "UTC";
}

/**
 * Parse a `datetime-local` value as wall-clock time in the given IANA timezone.
 */
export function parseDatetimeLocalInTimezone(
  datetimeLocal: string,
  timezone: string,
): Date {
  const normalized = datetimeLocal.trim().replace(" ", "T");
  const withSeconds =
    normalized.length === 16 ? `${normalized}:00` : normalized;
  return fromZonedTime(withSeconds, timezone);
}

function getTimeZoneNamePart(
  date: Date,
  timeZone: string,
  timeZoneName: "short" | "longOffset" | "shortOffset",
  locale?: string,
): string | null {
  try {
    const parts = new Intl.DateTimeFormat(locale ?? "en-US", {
      timeZone,
      timeZoneName,
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}

function isTimezoneAbbreviation(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^GMT/i.test(trimmed) || /^UTC/i.test(trimmed)) return false;
  return /^[A-Z]{2,6}$/.test(trimmed);
}

function normalizeOffsetKey(raw: string): string | null {
  const trimmed = raw.trim();
  const gmtMatch = trimmed.match(
    /^(?:GMT|UTC)\s*([+-])(\d{1,2})(?::(\d{2}))?$/i,
  );
  const directMatch = trimmed.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  const match = gmtMatch ?? directMatch;
  if (!match) return null;

  const sign = match[1];
  const hours = match[2].padStart(2, "0");
  const minutes = (match[3] ?? "00").padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function getOffsetKey(date: Date, timeZone: string): string | null {
  const raw =
    getTimeZoneNamePart(date, timeZone, "longOffset") ??
    getTimeZoneNamePart(date, timeZone, "shortOffset");
  return raw ? normalizeOffsetKey(raw) : null;
}

function getIntlShortAbbreviation(date: Date, timeZone: string): string | null {
  for (const locale of INTL_ABBREV_LOCALES) {
    const name = getTimeZoneNamePart(date, timeZone, "short", locale);
    if (name && isTimezoneAbbreviation(name)) return name;
  }
  return null;
}

function getDateFnsAbbreviation(date: Date, timeZone: string): string | null {
  try {
    const zzz = formatInTimeZone(date, timeZone, "zzz");
    if (zzz && isTimezoneAbbreviation(zzz)) return zzz;
  } catch {
    // ignore invalid timezone for date-fns
  }
  return null;
}

function formatGmtOffsetFallback(date: Date, timeZone: string): string {
  const raw =
    getTimeZoneNamePart(date, timeZone, "longOffset") ??
    getTimeZoneNamePart(date, timeZone, "shortOffset") ??
    "GMT";
  if (/^UTC/i.test(raw)) return raw.replace(/^UTC/i, "GMT");
  return raw;
}

function getTimezoneAbbreviation(date: Date, ianaTimeZone: string): string {
  const timeZone = ianaTimeZone.trim() || "UTC";

  const intlAbbrev = getIntlShortAbbreviation(date, timeZone);
  if (intlAbbrev) return intlAbbrev;

  const dateFnsAbbrev = getDateFnsAbbreviation(date, timeZone);
  if (dateFnsAbbrev) return dateFnsAbbrev;

  const offsetKey = getOffsetKey(date, timeZone);
  if (offsetKey && OFFSET_TO_ABBREVIATION[offsetKey]) {
    return OFFSET_TO_ABBREVIATION[offsetKey];
  }

  const ianaAbbrev = IANA_TIMEZONE_ABBREVIATIONS[timeZone];
  if (ianaAbbrev) return ianaAbbrev;

  return formatGmtOffsetFallback(date, timeZone);
}

function formatInTimezone(date: Date, timezone: string): string {
  const dateTime = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
  const abbrev = getTimezoneAbbreviation(date, timezone);
  return `${dateTime} ${abbrev}`;
}

function areEquivalentTimezones(
  date: Date,
  tzA: string,
  tzB: string,
): boolean {
  const a = tzA.trim();
  const b = tzB.trim();
  if (!a || !b) return a === b;
  if (a === b) return true;
  const offsetA = getOffsetKey(date, a);
  const offsetB = getOffsetKey(date, b);
  if (offsetA && offsetB) return offsetA === offsetB;
  return false;
}

/**
 * Primary label in admin timezone; append candidate time in brackets only when TZ differs.
 */
export function formatInterviewTime(
  date: Date,
  adminTimezone: string,
  candidateTimezone?: string | null,
): string {
  const primary = formatInTimezone(date, adminTimezone);
  const candidateTz = candidateTimezone?.trim();
  if (!candidateTz || areEquivalentTimezones(date, adminTimezone, candidateTz)) {
    return primary;
  }
  const candidate = formatInTimezone(date, candidateTz);
  return `${primary} (${candidate})`;
}

/** Minimum `datetime-local` string (start of today) for the given timezone. */
export function minDatetimeLocalForTimezone(timezone: string): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}T00:00`;
}

/** Format a UTC instant as `datetime-local` input value in the given timezone. */
export function formatDatetimeLocalInTimezone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:mm");
}

/** Current UTC instant as epoch ms. */
export function utcNowMs(): number {
  return Date.now();
}

/** True when `instant` (UTC DateTime from DB) is strictly after now. */
export function isUtcInstantInFuture(instant: Date): boolean {
  return instant.getTime() > utcNowMs();
}

/** True when interview has started or is in progress (cancel link expired). */
export function isUtcInstantStartedOrPast(instant: Date): boolean {
  return instant.getTime() <= utcNowMs();
}

/**
 * Parse YYYY-MM-DD as a UTC calendar day → [dayStart, nextDayStart).
 * Returns null if invalid.
 */
export function utcDayRangeFromDateParam(
  yyyyMmDd: string,
): { gte: Date; lt: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const gte = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const lt = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  if (gte.getUTCFullYear() !== year || gte.getUTCMonth() !== month - 1 || gte.getUTCDate() !== day) {
    return null;
  }
  return { gte, lt };
}
