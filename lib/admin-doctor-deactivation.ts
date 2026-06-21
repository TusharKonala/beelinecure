import {
  AppointmentStatus,
  ConsultationType,
  PaymentStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { doctorLocalToUtc, isDoctorTimeInPast } from "@/lib/timezone-display";

export type FutureAppointmentForDeactivation = {
  id: string;
  date: Date;
  time: string;
  timezone: string;
  consultationType: ConsultationType;
  paymentStatus: PaymentStatus;
};

/**
 * Confirmed/pending appointments whose slot is still in the future (doctor tz).
 * Same scope as doctor deactivation cancellation.
 */
export async function getFutureActiveAppointmentsForDoctor(
  doctorId: string,
): Promise<FutureAppointmentForDeactivation[]> {
  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    },
    select: {
      id: true,
      date: true,
      time: true,
      timezone: true,
      consultationType: true,
      paymentStatus: true,
    },
  });

  return appointments.filter((appointment) => {
    const dateStr = appointment.date.toISOString().slice(0, 10);
    return !isDoctorTimeInPast(dateStr, appointment.time, appointment.timezone);
  });
}

/**
 * Whether a deactivated doctor still has dashboard work: any PENDING or
 * CONFIRMED appointment (upcoming or pending review). Used for access gating
 * only — not for admin deactivation warnings (those use future slots only).
 */
export async function doctorHasUnfinishedAppointments(
  doctorId: string,
): Promise<boolean> {
  const count = await prisma.appointment.count({
    where: {
      doctorId,
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    },
  });
  return count > 0;
}

export function summarizeFutureAppointmentsForDeactivation(
  rows: FutureAppointmentForDeactivation[],
) {
  let futurePaidOnlineCount = 0;
  let futureClinicCount = 0;
  let futureOnlineUnpaidCount = 0;
  let farthestUtcMs = -Infinity;
  let farthestRow: FutureAppointmentForDeactivation | null = null;

  for (const row of rows) {
    if (
      row.consultationType === ConsultationType.ONLINE &&
      row.paymentStatus === PaymentStatus.PAID
    ) {
      futurePaidOnlineCount += 1;
    } else if (row.consultationType === ConsultationType.CLINIC) {
      futureClinicCount += 1;
    } else if (
      row.consultationType === ConsultationType.ONLINE &&
      row.paymentStatus !== PaymentStatus.PAID
    ) {
      futureOnlineUnpaidCount += 1;
    }

    const dateStr = row.date.toISOString().slice(0, 10);
    const utcMs = doctorLocalToUtc(dateStr, row.time, row.timezone).getTime();
    if (utcMs > farthestUtcMs) {
      farthestUtcMs = utcMs;
      farthestRow = row;
    }
  }

  return {
    futurePaidOnlineCount,
    futureClinicCount,
    futureOnlineUnpaidCount,
    totalFutureCount: rows.length,
    farthestRow,
  };
}
