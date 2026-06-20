import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { AppointmentStatus, type Prisma } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { isDoctorTimeInPast } from "@/lib/timezone-display";

type TabKey = "upcoming" | "completed" | "cancelled";
type DateFilterValue = "asc" | "desc" | "today" | "week" | "month";

function localYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function thisWeekBounds(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: localYMD(monday), end: localYMD(sunday) };
}

function thisMonthBounds(): { start: string; end: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: localYMD(first), end: localYMD(last) };
}

function ymdToDate(value: string): Date {
  const d = new Date(`${value}T00:00:00.000Z`);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const search = request.nextUrl.searchParams;
  const tab = (search.get("tab") ?? "upcoming") as TabKey;
  const doctorId = (search.get("doctorId") ?? "").trim();
  const dateFilter = (search.get("dateFilter") ?? "desc") as DateFilterValue;
  const page = Math.max(1, Number(search.get("page") ?? "1") || 1);
  const limit = Math.min(20, Math.max(5, Number(search.get("limit") ?? "10") || 10));

  const statuses =
    tab === "completed"
      ? [AppointmentStatus.COMPLETED]
      : tab === "cancelled"
        ? [AppointmentStatus.CANCELLED]
        : [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

  const baseWhere: Prisma.AppointmentWhereInput = {
    email,
    status: { in: statuses },
  };

  if (dateFilter === "today") {
    const today = ymdToDate(localYMD(new Date()));
    baseWhere.date = { gte: today, lte: today };
  } else if (dateFilter === "week") {
    const { start, end } = thisWeekBounds();
    baseWhere.date = { gte: ymdToDate(start), lte: ymdToDate(end) };
  } else if (dateFilter === "month") {
    const { start, end } = thisMonthBounds();
    baseWhere.date = { gte: ymdToDate(start), lte: ymdToDate(end) };
  }

  const sortDesc = dateFilter !== "asc";
  const orderBy: Prisma.AppointmentOrderByWithRelationInput[] = [
    { date: sortDesc ? "desc" : "asc" },
    { time: sortDesc ? "desc" : "asc" },
  ];

  const selectedWhere: Prisma.AppointmentWhereInput = doctorId
    ? { ...baseWhere, doctorId }
    : baseWhere;

  const [allAppointments, optionSourceAppointments] = await Promise.all([
    prisma.appointment.findMany({
      where: selectedWhere,
      orderBy,
      select: {
        id: true,
        doctorId: true,
        cancelToken: true,
        rescheduleToken: true,
        patientName: true,
        date: true,
        time: true,
        timezone: true,
        consultationType: true,
        googleMeetUrl: true,
        prescription: {
          select: {
            medicines: true,
            generalNotes: true,
          },
        },
        review: {
          select: {
            id: true,
            rating: true,
          },
        },
        status: true,
        doctor: {
          select: {
            name: true,
            specialization: true,
          },
        },
      },
    }),
    prisma.appointment.findMany({
      where: baseWhere,
      orderBy,
      select: {
        doctorId: true,
        date: true,
        time: true,
        timezone: true,
        doctor: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const filteredAppointments =
    tab === "upcoming"
      ? allAppointments.filter(
          (a) => !isDoctorTimeInPast(a.date.toISOString().slice(0, 10), a.time, a.timezone),
        )
      : allAppointments;

  const optionFilteredAppointments =
    tab === "upcoming"
      ? optionSourceAppointments.filter(
          (a) => !isDoctorTimeInPast(a.date.toISOString().slice(0, 10), a.time, a.timezone),
        )
      : optionSourceAppointments;

  const doctorOptions = Array.from(
    optionFilteredAppointments.reduce((map, appointment) => {
      if (!map.has(appointment.doctorId)) {
        map.set(appointment.doctorId, formatDoctorDisplayName(appointment.doctor.name));
      }
      return map;
    }, new Map<string, string>()),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const start = (page - 1) * limit;
  const items = filteredAppointments.slice(start, start + limit).map((a) => ({
    id: a.id,
    doctorId: a.doctorId,
    cancelToken: a.cancelToken,
    rescheduleToken: a.rescheduleToken,
    patientName: a.patientName,
    date: a.date.toISOString().slice(0, 10),
    time: a.time,
    timezone: a.timezone,
    consultationType: a.consultationType,
    googleMeetUrl: a.googleMeetUrl,
    prescription: a.prescription
      ? {
          medicines: a.prescription.medicines,
          generalNotes: a.prescription.generalNotes,
        }
      : null,
    review: a.review
      ? {
          id: a.review.id,
          rating: a.review.rating,
        }
      : null,
    status: a.status,
    doctor: {
      name: formatDoctorDisplayName(a.doctor.name),
      specialization: a.doctor.specialization,
    },
  }));

  return NextResponse.json({
    items,
    doctorOptions,
    hasMore: start + limit < filteredAppointments.length,
    total: filteredAppointments.length,
    page,
  });
}
