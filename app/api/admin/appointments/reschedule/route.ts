import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reschedulePatientAppointment } from "@/lib/appointment-reschedule";
import { evaluateRescheduleEligibility } from "@/lib/appointment-reschedule-eligibility";
import { z } from "zod";
import { headers } from "next/headers";

const bodySchema = z.object({
  appointmentId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

function parseDateOnly(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function adminErrorFromEligibility(
  code: ReturnType<typeof evaluateRescheduleEligibility>,
): { error: string; status: number } {
  switch (code) {
    case "cancelled":
      return { error: "Appointment is cancelled", status: 409 };
    case "completed":
      return { error: "Appointment is completed", status: 409 };
    case "appointment_passed":
      return { error: "Cannot reschedule a past appointment", status: 409 };
    case "too_close_to_reschedule":
      return {
        error:
          "Cannot reschedule within 24 hours of the appointment. Cancel and ask the patient to book again.",
        status: 409,
      };
    case "missing_tokens":
      return {
        error: "Appointment is missing cancel/reschedule tokens",
        status: 409,
      };
    default:
      return { error: "Appointment cannot be rescheduled", status: 409 };
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { appointmentId, date: dateParam, time } = parsed.data;
  const date = parseDateOnly(dateParam);
  if (!date) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const eligibility = evaluateRescheduleEligibility(appointment, {
    requireTokens: true,
  });
  if (eligibility !== "eligible") {
    const { error, status } = adminErrorFromEligibility(eligibility);
    return NextResponse.json({ error }, { status });
  }

  const headersList = await headers();
  const requestOrigin =
    headersList.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    request.nextUrl.origin;

  const result = await reschedulePatientAppointment({
    appointment: {
      id: appointment.id,
      doctorId: appointment.doctorId,
      email: appointment.email,
      patientName: appointment.patientName,
      consultationType: appointment.consultationType,
      timezone: appointment.timezone,
      patientTimezone: appointment.patientTimezone,
      cancelToken: appointment.cancelToken,
      rescheduleToken: appointment.rescheduleToken,
      previousDateYmd: appointment.date.toISOString().slice(0, 10),
      previousTime: appointment.time,
    },
    dateParam,
    date,
    time,
    requestOrigin,
    actorUserId: session.user.id,
    initiatedBy: "admin",
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "That time slot is no longer available" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
