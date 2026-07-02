import "server-only";

import {
  AppointmentStatus,
  ConsultationType,
} from "@/generated/prisma/client";
import { getAppointmentStartMsFromParts } from "@/lib/appointment-reschedule-eligibility";
import { prisma } from "@/lib/db";

export type FutureCancellableAppointment = {
  id: string;
  consultationType: ConsultationType;
};

export type FutureCancellableAppointmentStats = {
  appointmentIds: string[];
  total: number;
  inClinic: number;
  online: number;
};

function dateParamFromRow(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Future CONFIRMED/PENDING appointments whose start instant is after now. */
export async function getFutureCancellableAppointmentStats(
  doctorId: string,
  nowMs: number = Date.now(),
): Promise<FutureCancellableAppointmentStats> {
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
      consultationType: true,
    },
  });

  const appointmentIds: string[] = [];
  let inClinic = 0;
  let online = 0;

  for (const row of rows) {
    const startMs = getAppointmentStartMsFromParts(
      dateParamFromRow(row.date),
      row.time,
      row.timezone,
    );
    if (startMs <= nowMs) continue;

    appointmentIds.push(row.id);
    if (row.consultationType === ConsultationType.CLINIC) {
      inClinic += 1;
    } else {
      online += 1;
    }
  }

  return {
    appointmentIds,
    total: appointmentIds.length,
    inClinic,
    online,
  };
}
