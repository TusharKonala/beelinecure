import { formatInTimeZone } from "date-fns-tz";

export const MAX_DOCTOR_AVAILABILITY_RANGE_DAYS = 65;

/** Today as YYYY-MM-DD in the doctor's IANA timezone. */
export function getDoctorLocalTodayIso(iana: string): string {
  return formatInTimeZone(new Date(), iana, "yyyy-MM-dd");
}

/** Next calendar day after `ymd` (YYYY-MM-DD, civil date arithmetic). */
export function addOneDayYmd(ymd: string): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Inclusive list of ISO calendar dates from start to end (start <= end as YYYY-MM-DD). */
export function enumerateInclusiveYmd(start: string, end: string): string[] {
  if (start > end) return [];
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    if (cur === end) break;
    cur = addOneDayYmd(cur);
  }
  return out;
}

/** Stable Date for Prisma @db.Date from a doctor-local calendar day string. */
export function ymdToPrismaDate(ymd: string): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
}
