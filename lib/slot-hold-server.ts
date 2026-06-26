import "server-only";

import { SlotHoldStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { SLOT_HOLD_TTL_MS } from "@/lib/slot-hold-shared";
import { triggerSlotUpdated } from "@/lib/pusher-server";

export async function releaseSlotHold(holdId: string): Promise<boolean> {
  const updated = await prisma.slotHold.updateMany({
    where: { id: holdId, status: SlotHoldStatus.ACTIVE },
    data: { status: SlotHoldStatus.RELEASED },
  });

  if (updated.count === 0) return false;

  const hold = await prisma.slotHold.findUnique({
    where: { id: holdId },
    select: { doctorId: true, date: true, time: true },
  });
  if (hold) {
    await triggerSlotUpdated(hold.doctorId, {
      date: hold.date,
      time: hold.time,
    });
  }
  return true;
}

export async function consumeSlotHold(input: {
  holdId: string;
  doctorId: string;
  dateYmd: string;
  time: string;
}): Promise<void> {
  const updated = await prisma.slotHold.updateMany({
    where: {
      id: input.holdId,
      doctorId: input.doctorId,
      date: input.dateYmd,
      time: input.time,
      status: SlotHoldStatus.ACTIVE,
    },
    data: { status: SlotHoldStatus.CONSUMED },
  });

  if (updated.count > 0) {
    await triggerSlotUpdated(input.doctorId, {
      date: input.dateYmd,
      time: input.time,
    });
  }
}

export function slotHoldExpiresAt(): Date {
  return new Date(Date.now() + SLOT_HOLD_TTL_MS);
}
