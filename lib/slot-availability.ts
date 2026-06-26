import "server-only";

import {
  AppointmentStatus,
  BookingSessionStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export const SLOT_NO_LONGER_AVAILABLE_MESSAGE =
  "This time slot is no longer available";

export type SlotBookableInput = {
  doctorId: string;
  /** YYYY-MM-DD */
  dateYmd: string;
  time: string;
  excludeAppointmentId?: string;
  /** Exclude patient's own in-flight session when re-validating checkout. */
  excludeBookingSessionId?: string;
};

export type SlotBookableResult =
  | { ok: true }
  | { ok: false; reason: "appointment_taken" | "checkout_in_progress" };

function parseDateOnly(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/** Marks TTL-expired PENDING booking sessions as EXPIRED. */
export async function expireStaleBookingSessions(): Promise<void> {
  await prisma.bookingSession.updateMany({
    where: {
      status: BookingSessionStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    data: { status: BookingSessionStatus.EXPIRED },
  });
}

/**
 * Returns active PENDING booking-session hold times per UTC date key (YYYY-MM-DD).
 */
export async function activeBookingSessionHoldsByDate(input: {
  doctorId: string;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<Map<string, Set<string>>> {
  await expireStaleBookingSessions();

  const sessions = await prisma.bookingSession.findMany({
    where: {
      doctorId: input.doctorId,
      status: BookingSessionStatus.PENDING,
      expiresAt: { gt: new Date() },
      date: {
        gte: input.rangeStart.toISOString().slice(0, 10),
        lte: input.rangeEnd.toISOString().slice(0, 10),
      },
    },
    select: { date: true, time: true },
  });

  const byDay = new Map<string, Set<string>>();
  for (const session of sessions) {
    const key = session.date;
    if (!byDay.has(key)) byDay.set(key, new Set());
    byDay.get(key)!.add(session.time);
  }
  return byDay;
}

/**
 * Read-only check: slot is not booked and not held by another patient's checkout.
 */
export async function isSlotBookable(
  input: SlotBookableInput,
): Promise<SlotBookableResult> {
  return assertSlotBookable(input);
}

/**
 * Ensures a doctor/date/time slot can be claimed. Expires stale holds first.
 */
export async function assertSlotBookable(
  input: SlotBookableInput,
): Promise<SlotBookableResult> {
  const date = parseDateOnly(input.dateYmd);
  if (!date) {
    return { ok: false, reason: "appointment_taken" };
  }

  await expireStaleBookingSessions();

  const existingAppointment = await prisma.appointment.findFirst({
    where: {
      doctorId: input.doctorId,
      date,
      time: input.time,
      status: { not: AppointmentStatus.CANCELLED },
      ...(input.excludeAppointmentId
        ? { id: { not: input.excludeAppointmentId } }
        : {}),
    },
    select: { id: true },
  });

  if (existingAppointment) {
    return { ok: false, reason: "appointment_taken" };
  }

  const conflictingSession = await prisma.bookingSession.findFirst({
    where: {
      doctorId: input.doctorId,
      date: input.dateYmd,
      time: input.time,
      status: BookingSessionStatus.PENDING,
      expiresAt: { gt: new Date() },
      ...(input.excludeBookingSessionId
        ? { id: { not: input.excludeBookingSessionId } }
        : {}),
    },
    select: { id: true },
  });

  if (conflictingSession) {
    return { ok: false, reason: "checkout_in_progress" };
  }

  return { ok: true };
}
