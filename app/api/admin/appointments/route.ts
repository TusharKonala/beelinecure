import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import {
  AppointmentStatus,
  type Prisma,
  UserRole,
} from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import {
  doctorAppointmentDateTimeOrderBy,
  doctorAppointmentDateWhere,
  doctorAppointmentOnDateWhere,
  doctorAppointmentOrderByForOnDate,
  mergeAdminDoctorSearch,
  mergeDoctorPatientSearch,
  normalizeDoctorDateFilter,
  parseDoctorOnDate,
} from "@/lib/doctor-appointment-filters";
import { prisma } from "@/lib/db";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { isDoctorTimeInPast } from "@/lib/timezone-display";
import { cancelAppointmentByStaff } from "@/lib/doctor-cancellations";
import { staffCancelAppointmentSchema } from "@/lib/appointment-schemas";

type TabKey = "upcoming" | "pending-review" | "completed" | "cancelled";

function normalizeTab(raw: string | null): TabKey {
  if (raw === "pending-review") return "pending-review";
  if (raw === "completed") return "completed";
  if (raw === "cancelled") return "cancelled";
  return "upcoming";
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tab = normalizeTab(request.nextUrl.searchParams.get("tab"));
  const patientSearch = (request.nextUrl.searchParams.get("patientSearch") ?? "").trim();
  const doctorSearch = (request.nextUrl.searchParams.get("doctorSearch") ?? "").trim();
  const onDate = parseDoctorOnDate(request.nextUrl.searchParams.get("onDate"));
  const dateFilter = normalizeDoctorDateFilter(
    onDate ? null : request.nextUrl.searchParams.get("dateFilter"),
  );
  const page = Math.max(
    1,
    Number(request.nextUrl.searchParams.get("page") ?? "1") || 1,
  );
  const limit = Math.min(
    20,
    Math.max(
      5,
      Number(request.nextUrl.searchParams.get("limit") ?? "5") || 5,
    ),
  );
  const statuses =
    tab === "completed"
      ? [AppointmentStatus.COMPLETED]
      : tab === "cancelled"
        ? [AppointmentStatus.CANCELLED]
        : [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

  const baseWhere: Prisma.AppointmentWhereInput = {
    status: { in: statuses },
  };

  const dateWhere = onDate
    ? doctorAppointmentOnDateWhere(onDate)
    : doctorAppointmentDateWhere(dateFilter, "UTC");
  if (dateWhere) {
    baseWhere.date = dateWhere;
  }

  let selectedWhere = mergeDoctorPatientSearch(baseWhere, patientSearch);
  selectedWhere = mergeAdminDoctorSearch(selectedWhere, doctorSearch);

  const appointments = await prisma.appointment.findMany({
    where: selectedWhere,
    orderBy: onDate
      ? doctorAppointmentOrderByForOnDate()
      : doctorAppointmentDateTimeOrderBy(dateFilter),
    select: {
      id: true,
      patientName: true,
      email: true,
      phone: true,
      date: true,
      time: true,
      timezone: true,
      patientTimezone: true,
      durationMinutes: true,
      consultationType: true,
      status: true,
      notes: true,
      googleMeetUrl: true,
      doctorId: true,
      doctor: {
        select: {
          name: true,
          specialization: true,
          timezone: true,
        },
      },
    },
  });

  const filteredAppointments =
    tab === "pending-review"
      ? appointments.filter(
          (a) =>
            a.status === AppointmentStatus.CONFIRMED &&
            isDoctorTimeInPast(
              a.date.toISOString().slice(0, 10),
              a.time,
              a.timezone,
            ),
        )
      : tab === "upcoming"
        ? appointments.filter((a) => {
            if (a.status === AppointmentStatus.PENDING) return true;
            if (a.status !== AppointmentStatus.CONFIRMED) return false;
            return !isDoctorTimeInPast(
              a.date.toISOString().slice(0, 10),
              a.time,
              a.timezone,
            );
          })
        : appointments;
  const start = (page - 1) * limit;
  const paginatedAppointments = filteredAppointments.slice(start, start + limit);

  return NextResponse.json({
    items: paginatedAppointments.map((a) => ({
      id: a.id,
      doctorId: a.doctorId,
      patientName: a.patientName,
      email: a.email,
      phone: a.phone,
      date: a.date.toISOString().slice(0, 10),
      time: a.time,
      timezone: a.timezone,
      patientTimezone: a.patientTimezone,
      durationMinutes: a.durationMinutes,
      consultationType: a.consultationType,
      status: a.status,
      notes: a.notes,
      googleMeetUrl: a.googleMeetUrl,
      doctor: {
        name: formatDoctorDisplayName(a.doctor.name),
        specialization: a.doctor.specialization,
        timezone: a.doctor.timezone,
      },
    })),
    hasMore: start + limit < filteredAppointments.length,
    total: filteredAppointments.length,
    page,
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = staffCancelAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { appointmentId, reason, cancellationNote } = parsed.data;

  const result = await cancelAppointmentByStaff({
    appointmentId,
    reason: reason ?? null,
    requestOrigin: request.nextUrl.origin,
    actorUserId: session.user.id,
    cancellationNote,
  });

  if (!result.ok) {
    if (result.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
    if (result.code === "ALREADY_CANCELLED") {
      return NextResponse.json(
        {
          error: "Appointment already cancelled",
          code: "ALREADY_CANCELLED",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Completed appointments cannot be cancelled" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
