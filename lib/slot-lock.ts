import "server-only";

import type { Prisma } from "@/generated/prisma/client";

/** Thrown when a slot is no longer in doctor availability at commit time. */
export class SlotUnavailableError extends Error {
  constructor() {
    super("This time slot is no longer available");
    this.name = "SlotUnavailableError";
  }
}

/**
 * Serializes booking/reschedule writes against doctor availability mutations
 * for the same (doctor, calendar day). Auto-released at tx commit/rollback.
 */
export async function acquireDoctorDateLock(
  tx: Prisma.TransactionClient,
  doctorId: string,
  dateYmd: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${doctorId}), hashtext(${dateYmd}))`;
}

/** Acquire multiple date locks in sorted order to avoid deadlocks. */
export async function acquireDoctorDateLocks(
  tx: Prisma.TransactionClient,
  doctorId: string,
  dateYmds: string[],
): Promise<void> {
  for (const d of [...new Set(dateYmds)].sort()) {
    await acquireDoctorDateLock(tx, doctorId, d);
  }
}
