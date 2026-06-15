import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { DoctorApprovalStatus, UserRole } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import {
  getFutureActiveAppointmentsForDoctor,
  summarizeFutureAppointmentsForDeactivation,
} from "@/lib/admin-doctor-deactivation";
import { prisma } from "@/lib/db";
import {
  formatDateInDoctorTz,
  formatDateInPatientTz,
  formatTimeInDoctorTz,
  formatTimeInPatientTz,
  isValidIanaTimeZone,
} from "@/lib/timezone-display";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ doctorId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { doctorId } = await context.params;
  if (!doctorId) {
    return NextResponse.json({ error: "Invalid doctor id" }, { status: 400 });
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: { id: true },
  });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const rows = await getFutureActiveAppointmentsForDoctor(doctor.id);
  const summary = summarizeFutureAppointmentsForDeactivation(rows);

  let farthestAppointment: {
    doctorDateLabel: string;
    doctorTimeLabel: string;
    doctorTimezone: string;
    viewerDateLabel?: string;
    viewerTimeLabel?: string;
    viewerTimezone?: string;
  } | null = null;

  if (summary.farthestRow) {
    const fr = summary.farthestRow;
    const dateStr = fr.date.toISOString().slice(0, 10);
    const doctorDateLabel = formatDateInDoctorTz(dateStr, fr.time, fr.timezone);
    const doctorTimeLabel = formatTimeInDoctorTz(dateStr, fr.time, fr.timezone);

    const rawViewerTz = request.nextUrl.searchParams.get("viewerTz");
    const viewerTz =
      rawViewerTz && isValidIanaTimeZone(rawViewerTz) ? rawViewerTz.trim() : null;
    const showViewerTz =
      viewerTz != null && viewerTz !== fr.timezone;

    farthestAppointment = {
      doctorDateLabel,
      doctorTimeLabel,
      doctorTimezone: fr.timezone,
      ...(showViewerTz
        ? {
            viewerDateLabel: formatDateInPatientTz(
              dateStr,
              fr.time,
              fr.timezone,
              viewerTz,
            ),
            viewerTimeLabel: formatTimeInPatientTz(
              dateStr,
              fr.time,
              fr.timezone,
              viewerTz,
            ),
            viewerTimezone: viewerTz,
          }
        : {}),
    };
  }

  return NextResponse.json({
    futurePaidOnlineCount: summary.futurePaidOnlineCount,
    futureClinicCount: summary.futureClinicCount,
    futureOnlineUnpaidCount: summary.futureOnlineUnpaidCount,
    totalFutureCount: summary.totalFutureCount,
    farthestAppointment,
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ doctorId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { doctorId } = await context.params;
  if (!doctorId) {
    return NextResponse.json({ error: "Invalid doctor id" }, { status: 400 });
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: { id: true, isActive: true },
  });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  if (!doctor.isActive) {
    return NextResponse.json({
      ok: true,
      alreadyInactive: true,
      cancelledAppointments: 0,
    });
  }

  // Do not mass-cancel future appointments here. The doctor stays able to sign in
  // (while upcoming work remains) and cancel from the dashboard so refunds follow policy.

  await prisma.doctor.update({
    where: { id: doctor.id },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedByUserId: session.user.id,
    },
  });

  return NextResponse.json({
    ok: true,
    alreadyInactive: false,
    cancelledAppointments: 0,
  });
}

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ doctorId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { doctorId } = await context.params;
  if (!doctorId) {
    return NextResponse.json({ error: "Invalid doctor id" }, { status: 400 });
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: { id: true, isActive: true, approvalStatus: true },
  });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }
  if (doctor.approvalStatus !== DoctorApprovalStatus.APPROVED) {
    return NextResponse.json(
      { error: "Only approved doctors can be reactivated." },
      { status: 400 },
    );
  }
  if (doctor.isActive) {
    return NextResponse.json({ ok: true, alreadyActive: true });
  }

  await prisma.doctor.update({
    where: { id: doctor.id },
    data: {
      isActive: true,
      deactivatedAt: null,
      deactivatedByUserId: null,
    },
  });

  return NextResponse.json({ ok: true, alreadyActive: false });
}
