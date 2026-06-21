import { prisma } from "@/lib/db";
import { doctorHasUnfinishedAppointments } from "@/lib/admin-doctor-deactivation";

export type DoctorAccessStatus =
  | { found: false }
  | {
      found: true;
      doctorId: string;
      doctorName: string;
      isActive: boolean;
      hasRemainingAppointments: boolean;
    };

/**
 * Resolves dashboard access for a logged-in doctor. When `isActive` is false,
 * remaining = any unfinished PENDING/CONFIRMED appointment (upcoming or
 * pending review). Used by the doctor layout to either show a deactivation
 * banner (still has work) or fully lock the doctor out (nothing left to manage).
 */
export async function getDoctorAccessStatus(
  userId: string,
): Promise<DoctorAccessStatus> {
  const doctor = await prisma.doctor.findUnique({
    where: { userId },
    select: { id: true, name: true, isActive: true },
  });
  if (!doctor) {
    return { found: false };
  }
  const doctorName = doctor.name.trim() || "Doctor";
  if (doctor.isActive) {
    return {
      found: true,
      doctorId: doctor.id,
      doctorName,
      isActive: true,
      hasRemainingAppointments: true,
    };
  }
  const hasRemainingAppointments = await doctorHasUnfinishedAppointments(
    doctor.id,
  );
  return {
    found: true,
    doctorId: doctor.id,
    doctorName,
    isActive: false,
    hasRemainingAppointments,
  };
}
