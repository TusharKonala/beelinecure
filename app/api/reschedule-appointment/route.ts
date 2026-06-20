import { prisma } from "@/lib/db";
import { AppointmentStatus } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";
import { fromZonedTime } from "date-fns-tz";
import { reschedulePatientAppointment } from "@/lib/appointment-reschedule";

const RESCHEDULE_MIN_LEAD_TIME_MS = 24 * 60 * 60 * 1000;

const rescheduleTokenSchema = z.object({
  appointmentId: z.string().min(1),
  token: z.string().min(1),
});

const rescheduleSchema = z.object({
  appointmentId: z.string().min(1),
  token: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  patientTimezone: z.string().min(1).max(128).optional(),
});

function parseDateOnly(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

type RescheduleResponse =
  | { status: "success"; appointment?: unknown }
  | { status: "invalid_link" }
  | { status: "invalid_body" }
  | { status: "already_cancelled" }
  | { status: "appointment_passed" }
  | { status: "too_close_to_reschedule" }
  | { status: "slot_unavailable" };

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getAppointmentStartMs(dateParam: string, time: string, timezone: string): number {
  const timeWithSeconds = time.length === 5 ? `${time}:00` : time;
  return fromZonedTime(`${dateParam}T${timeWithSeconds}`, timezone).getTime();
}

export async function GET(request: NextRequest) {
  const appointmentId = request.nextUrl.searchParams.get("appointmentId") ?? "";
  const token = request.nextUrl.searchParams.get("token") ?? "";

  const parsed = rescheduleTokenSchema.safeParse({ appointmentId, token });
  if (!parsed.success) {
    return NextResponse.json({
      status: "invalid_link",
    } satisfies RescheduleResponse);
  }

  const { appointmentId: validatedAppointmentId, token: validatedToken } =
    parsed.data;

  const appointment = await prisma.appointment.findUnique({
    where: { id: validatedAppointmentId },
  });

  if (
    !appointment ||
    !appointment.rescheduleToken ||
    appointment.rescheduleToken !== validatedToken
  ) {
    return NextResponse.json({
      status: "invalid_link",
    } satisfies RescheduleResponse);
  }

  if (appointment.status === AppointmentStatus.CANCELLED) {
    return NextResponse.json({
      status: "already_cancelled",
    } satisfies RescheduleResponse);
  }

  if (appointment.status === AppointmentStatus.COMPLETED) {
    return NextResponse.json({
      status: "invalid_link",
    } satisfies RescheduleResponse);
  }

  const appointmentDateParam = appointment.date.toISOString().slice(0, 10);
  const appointmentStartMs = getAppointmentStartMs(
    appointmentDateParam,
    appointment.time,
    appointment.timezone,
  );
  if (appointmentStartMs <= Date.now()) {
    return NextResponse.json({
      status: "appointment_passed",
    } satisfies RescheduleResponse);
  }
  if (appointmentStartMs - Date.now() < RESCHEDULE_MIN_LEAD_TIME_MS) {
    return NextResponse.json({
      status: "too_close_to_reschedule",
    } satisfies RescheduleResponse);
  }

  return NextResponse.json({
    status: "success",
    appointment: {
      id: appointment.id,
      doctorId: appointment.doctorId,
      date: formatDateOnly(appointment.date),
      time: appointment.time,
      timezone: appointment.timezone,
      consultationType: appointment.consultationType,
      status: appointment.status,
      durationMinutes: appointment.durationMinutes,
    },
  } satisfies RescheduleResponse);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({
      status: "invalid_body",
    } satisfies RescheduleResponse);
  }

  const parsed = rescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      status: "invalid_body",
    } satisfies RescheduleResponse);
  }

  const { appointmentId, token, date: dateParam, time, patientTimezone } = parsed.data;
  const date = parseDateOnly(dateParam);
  if (!date) {
    return NextResponse.json({
      status: "invalid_body",
    } satisfies RescheduleResponse);
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (
    !appointment ||
    !appointment.rescheduleToken ||
    appointment.rescheduleToken !== token
  ) {
    return NextResponse.json({
      status: "invalid_link",
    } satisfies RescheduleResponse);
  }

  if (appointment.status === AppointmentStatus.CANCELLED) {
    return NextResponse.json({
      status: "already_cancelled",
    } satisfies RescheduleResponse);
  }

  if (appointment.status === AppointmentStatus.COMPLETED) {
    return NextResponse.json({
      status: "invalid_link",
    } satisfies RescheduleResponse);
  }

  const appointmentDateParam = appointment.date.toISOString().slice(0, 10);
  const appointmentStartMs = getAppointmentStartMs(
    appointmentDateParam,
    appointment.time,
    appointment.timezone,
  );
  if (appointmentStartMs <= Date.now()) {
    return NextResponse.json({
      status: "appointment_passed",
    } satisfies RescheduleResponse);
  }
  if (appointmentStartMs - Date.now() < RESCHEDULE_MIN_LEAD_TIME_MS) {
    return NextResponse.json({
      status: "too_close_to_reschedule",
    } satisfies RescheduleResponse);
  }

  const headersList = await headers();
  const requestOrigin =
    headersList.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";

  // Patient reschedule via tokenized link — set the patient as the actor so
  // their toaster suppresses the live toast for their own action.
  const patientUser = await prisma.user.findUnique({
    where: { email: appointment.email },
    select: { id: true },
  });
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
    },
    dateParam,
    date,
    time,
    patientTimezoneOverride: patientTimezone,
    requestOrigin,
    actorUserId: patientUser?.id ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({
      status: "slot_unavailable",
    } satisfies RescheduleResponse);
  }

  return NextResponse.json({ status: "success" } satisfies RescheduleResponse);
}
