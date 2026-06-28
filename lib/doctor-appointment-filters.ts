import type { Prisma } from "@/generated/prisma/client";

/** Matches doctor dashboard appointment / prescription date dropdown values. */
export type DoctorDateFilterValue = "asc" | "desc" | "today" | "week" | "month";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDoctorOnDate(raw: string | null): string | null {
  const v = raw?.trim();
  if (!v || !YMD_RE.test(v)) return null;
  return v;
}

export function normalizeDoctorDateFilter(raw: string | null): DoctorDateFilterValue {
  if (raw === "asc") return "asc";
  if (raw === "today") return "today";
  if (raw === "week") return "week";
  if (raw === "month") return "month";
  if (raw === "desc") return "desc";
  return "asc";
}

function ymdToDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function ymdFromDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysToYmd(ymd: string, days: number): string {
  const base = ymdToDate(ymd);
  base.setUTCDate(base.getUTCDate() + days);
  return ymdFromDateUtc(base);
}

function ymdInTimezone(timezone: string, baseDate = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(baseDate);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return ymdFromDateUtc(baseDate);
  return `${year}-${month}-${day}`;
}

function thisWeekBoundsInTimezone(timezone: string): { start: string; end: string } {
  const today = ymdInTimezone(timezone);
  const day = ymdToDate(today).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = addDaysToYmd(today, mondayOffset);
  return { start, end: addDaysToYmd(start, 6) };
}

function thisMonthBoundsInTimezone(timezone: string): { start: string; end: string } {
  const today = ymdInTimezone(timezone);
  const [y, m] = today.split("-").map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    return { start: today, end: today };
  }

  const year = String(y).padStart(4, "0");
  const month = String(m).padStart(2, "0");
  const start = `${year}-${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/**
 * Restricts `Appointment.date` to today / this week / this month in the doctor's timezone.
 * Returns undefined for sort-only modes (asc/desc) where no date range applies.
 */
export function doctorAppointmentDateWhere(
  dateFilter: DoctorDateFilterValue,
  doctorTimezone: string,
): Prisma.DateTimeFilter | undefined {
  if (dateFilter === "today") {
    const today = ymdInTimezone(doctorTimezone);
    return { gte: ymdToDate(today), lte: ymdToDate(today) };
  }
  if (dateFilter === "week") {
    const { start, end } = thisWeekBoundsInTimezone(doctorTimezone);
    return { gte: ymdToDate(start), lte: ymdToDate(end) };
  }
  if (dateFilter === "month") {
    const { start, end } = thisMonthBoundsInTimezone(doctorTimezone);
    return { gte: ymdToDate(start), lte: ymdToDate(end) };
  }
  return undefined;
}

/** Single calendar day — same gte/lte pattern as the Today preset. */
export function doctorAppointmentOnDateWhere(
  onDate: string,
): Prisma.DateTimeFilter {
  const d = ymdToDate(onDate);
  return { gte: d, lte: d };
}

export function doctorAppointmentOrderByForOnDate(): Prisma.AppointmentOrderByWithRelationInput[] {
  return [{ time: "asc" }];
}

/** Patient search: name, email, or phone (case-insensitive). */
export function mergeDoctorPatientSearch(
  baseWhere: Prisma.AppointmentWhereInput,
  search: string,
): Prisma.AppointmentWhereInput {
  const trimmed = search.trim();
  if (!trimmed) return baseWhere;
  return {
    ...baseWhere,
    OR: [
      { patientName: { contains: trimmed, mode: "insensitive" } },
      { email: { contains: trimmed, mode: "insensitive" } },
      { phone: { contains: trimmed, mode: "insensitive" } },
    ],
  };
}

/** Admin: filter by doctor display name, doctor phone, or account email. */
export function mergeAdminDoctorSearch(
  baseWhere: Prisma.AppointmentWhereInput,
  search: string,
): Prisma.AppointmentWhereInput {
  const trimmed = search.trim();
  if (!trimmed) return baseWhere;
  return {
    AND: [
      baseWhere,
      {
        doctor: {
          is: {
            OR: [
              { name: { contains: trimmed, mode: "insensitive" } },
              { phone: { contains: trimmed, mode: "insensitive" } },
              {
                user: {
                  is: {
                    email: { contains: trimmed, mode: "insensitive" },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

export function doctorAppointmentDateTimeOrderBy(
  dateFilter: DoctorDateFilterValue,
): Prisma.AppointmentOrderByWithRelationInput[] {
  const sortDesc = dateFilter !== "asc";
  return [
    { date: sortDesc ? "desc" : "asc" },
    { time: sortDesc ? "desc" : "asc" },
  ];
}
