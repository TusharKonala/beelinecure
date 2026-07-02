import "server-only";

import { AppointmentStatus } from "@/generated/prisma/client";
import { getAppointmentStartMsFromParts } from "@/lib/appointment-reschedule-eligibility";
import { prisma } from "@/lib/db";

function dateParamFromRow(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * CONFIRMED/PENDING appointments for a doctor whose stored timezone no longer
 * matches the doctor's current timezone and whose start instant is still future.
 */
export async function findStaleTimezoneFutureAppointments(
  doctorId: string,
  nowMs: number = Date.now(),
): Promise<{ id: string }[]> {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: { timezone: true },
  });
  if (!doctor) return [];

  const currentTimezone = doctor.timezone;

  const rows = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: {
        in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
      },
    },
    select: {
      id: true,
      date: true,
      time: true,
      timezone: true,
    },
  });

  const stale: { id: string }[] = [];
  for (const row of rows) {
    if (row.timezone === currentTimezone) continue;
    const startMs = getAppointmentStartMsFromParts(
      dateParamFromRow(row.date),
      row.time,
      row.timezone,
    );
    if (startMs <= nowMs) continue;
    stale.push({ id: row.id });
  }

  return stale;
}
