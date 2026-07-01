import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";
import { reschedulePatientAppointment } from "@/lib/appointment-reschedule";
import {
  evaluateRescheduleEligibility,
  type RescheduleEligibilityCode,
} from "@/lib/appointment-reschedule-eligibility";

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
  expectedDoctorTimezone: z.string().min(1).max(128).optional(),
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
  | { status: "slot_unavailable" }
  | { status: "timezone_changed" };

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function patientStatusFromEligibility(
  code: RescheduleEligibilityCode,
): RescheduleResponse["status"] {
  switch (code) {
    case "eligible":
      return "success";
    case "cancelled":
      return "already_cancelled";
    case "appointment_passed":
      return "appointment_passed";
    case "too_close_to_reschedule":
      return "too_close_to_reschedule";
    case "completed":
    case "missing_tokens":
    default:
      return "invalid_link";
  }
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

  const eligibility = evaluateRescheduleEligibility(appointment, {
    requireTokens: true,
  });
  if (eligibility !== "eligible") {
    return NextResponse.json({
      status: patientStatusFromEligibility(eligibility),
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

  const {
    appointmentId,
    token,
    date: dateParam,
    time,
    patientTimezone,
    expectedDoctorTimezone,
  } = parsed.data;
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

  const eligibility = evaluateRescheduleEligibility(appointment, {
    requireTokens: true,
  });
  if (eligibility !== "eligible") {
    return NextResponse.json({
      status: patientStatusFromEligibility(eligibility),
    } satisfies RescheduleResponse);
  }

  const headersList = await headers();
  const requestOrigin =
    headersList.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";

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
      previousDateYmd: appointment.date.toISOString().slice(0, 10),
      previousTime: appointment.time,
    },
    dateParam,
    date,
    time,
    patientTimezoneOverride: patientTimezone,
    expectedDoctorTimezone,
    requestOrigin,
    actorUserId: patientUser?.id ?? null,
    initiatedBy: "patient",
  });

  if (!result.ok) {
    if (result.code === "appointment_cancelled") {
      return NextResponse.json({
        status: "already_cancelled",
      } satisfies RescheduleResponse);
    }
    if (result.code === "doctor_timezone_changed") {
      return NextResponse.json({
        status: "timezone_changed",
      } satisfies RescheduleResponse);
    }
    return NextResponse.json({
      status: "slot_unavailable",
    } satisfies RescheduleResponse);
  }

  return NextResponse.json({ status: "success" } satisfies RescheduleResponse);
}
