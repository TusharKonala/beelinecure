import "server-only";

import {
  AppointmentStatus,
  BookingSessionStatus,
  SlotHoldStatus,
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
  /** Exclude patient's own in-flight session when re-submitting on booking-session. */
  excludeBookingSessionId?: string;
  /** Exclude patient's own slot hold from the book page. */
  excludeSlotHoldId?: string;
};

export type SlotCheckoutInput = {
  doctorId: string;
  /** YYYY-MM-DD */
  dateYmd: string;
  time: string;
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

/** Marks TTL-expired ACTIVE slot holds as EXPIRED. */
export async function expireStaleSlotHolds(): Promise<void> {
  await prisma.slotHold.updateMany({
    where: {
      status: SlotHoldStatus.ACTIVE,
      expiresAt: { lt: new Date() },
    },
    data: { status: SlotHoldStatus.EXPIRED },
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
 * Returns active SlotHold times per UTC date key (YYYY-MM-DD).
 */
export async function activeSlotHoldsByDate(input: {
  doctorId: string;
  rangeStart: Date;
  rangeEnd: Date;
  excludeSlotHoldId?: string;
}): Promise<Map<string, Set<string>>> {
  await expireStaleSlotHolds();

  const holds = await prisma.slotHold.findMany({
    where: {
      doctorId: input.doctorId,
      status: SlotHoldStatus.ACTIVE,
      expiresAt: { gt: new Date() },
      date: {
        gte: input.rangeStart.toISOString().slice(0, 10),
        lte: input.rangeEnd.toISOString().slice(0, 10),
      },
      ...(input.excludeSlotHoldId
        ? { id: { not: input.excludeSlotHoldId } }
        : {}),
    },
    select: { date: true, time: true },
  });

  const byDay = new Map<string, Set<string>>();
  for (const hold of holds) {
    const key = hold.date;
    if (!byDay.has(key)) byDay.set(key, new Set());
    byDay.get(key)!.add(hold.time);
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
  await expireStaleSlotHolds();

  if (
    await hasActiveAppointmentAtSlot({
      doctorId: input.doctorId,
      date,
      time: input.time,
      excludeAppointmentId: input.excludeAppointmentId,
    })
  ) {
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

  const conflictingHold = await prisma.slotHold.findFirst({
    where: {
      doctorId: input.doctorId,
      date: input.dateYmd,
      time: input.time,
      status: SlotHoldStatus.ACTIVE,
      expiresAt: { gt: new Date() },
      ...(input.excludeSlotHoldId
        ? { id: { not: input.excludeSlotHoldId } }
        : {}),
    },
    select: { id: true },
  });

  if (conflictingHold) {
    return { ok: false, reason: "checkout_in_progress" };
  }

  return { ok: true };
}

async function hasActiveAppointmentAtSlot(input: {
  doctorId: string;
  date: Date;
  time: string;
  excludeAppointmentId?: string;
}): Promise<boolean> {
  const existingAppointment = await prisma.appointment.findFirst({
    where: {
      doctorId: input.doctorId,
      date: input.date,
      time: input.time,
      status: { not: AppointmentStatus.CANCELLED },
      ...(input.excludeAppointmentId
        ? { id: { not: input.excludeAppointmentId } }
        : {}),
    },
    select: { id: true },
  });
  return existingAppointment !== null;
}

/**
 * Re-validates a slot at payment time. Only blocks when an appointment already
 * exists — the session holder must be able to reach Stripe even if they are
 * the sole PENDING hold on this slot.
 */
export async function assertSlotAvailableForCheckout(
  input: SlotCheckoutInput,
): Promise<SlotBookableResult> {
  const date = parseDateOnly(input.dateYmd);
  if (!date) {
    return { ok: false, reason: "appointment_taken" };
  }

  await expireStaleBookingSessions();

  if (
    await hasActiveAppointmentAtSlot({
      doctorId: input.doctorId,
      date,
      time: input.time,
    })
  ) {
    return { ok: false, reason: "appointment_taken" };
  }

  return { ok: true };
}
