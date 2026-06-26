import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { SlotHoldStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { publicDoctorByIdWhere } from "@/lib/doctor-visibility";
import {
  assertSlotBookable,
  expireStaleSlotHolds,
  SLOT_NO_LONGER_AVAILABLE_MESSAGE,
} from "@/lib/slot-availability";
import {
  releaseSlotHold,
  slotHoldExpiresAt,
} from "@/lib/slot-hold-server";
import { triggerSlotUpdated } from "@/lib/pusher-server";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";

const createHoldSchema = z.object({
  doctorId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(1),
  consultationType: z.enum(["ONLINE", "CLINIC"]),
  holdId: z.string().uuid().optional(),
});

const releaseHoldSchema = z.object({
  holdId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createHoldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const { doctorId, date, time, consultationType, holdId: clientHoldId } =
    parsed.data;

  const doctor = await prisma.doctor.findFirst({
    where: publicDoctorByIdWhere(doctorId),
    select: { id: true },
  });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  await expireStaleSlotHolds();

  if (clientHoldId) {
    const existing = await prisma.slotHold.findUnique({
      where: { id: clientHoldId },
      select: {
        id: true,
        doctorId: true,
        date: true,
        time: true,
        status: true,
        expiresAt: true,
      },
    });
    if (
      existing &&
      existing.status === SlotHoldStatus.ACTIVE &&
      existing.expiresAt > new Date() &&
      existing.doctorId === doctorId &&
      existing.date === date &&
      existing.time === time
    ) {
      await prisma.slotHold.update({
        where: { id: existing.id },
        data: { expiresAt: slotHoldExpiresAt() },
      });
      return NextResponse.json({ holdId: existing.id });
    }
  }

  const slotBookable = await assertSlotBookable({
    doctorId,
    dateYmd: date,
    time,
    excludeSlotHoldId: clientHoldId,
  });
  if (!slotBookable.ok) {
    return NextResponse.json(
      { error: SLOT_NO_LONGER_AVAILABLE_MESSAGE },
      { status: 409 },
    );
  }

  const holdId = clientHoldId ?? randomUUID();

  try {
    await prisma.slotHold.create({
      data: {
        id: holdId,
        doctorId,
        date,
        time,
        consultationType,
        status: SlotHoldStatus.ACTIVE,
        expiresAt: slotHoldExpiresAt(),
      },
    });
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: SLOT_NO_LONGER_AVAILABLE_MESSAGE },
        { status: 409 },
      );
    }
    throw err;
  }

  await triggerSlotUpdated(doctorId, { date, time });

  return NextResponse.json({ holdId });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const holdIdFromQuery = request.nextUrl.searchParams.get("holdId");

  let holdId: string | undefined;
  if (body) {
    const parsed = releaseHoldSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }
    holdId = parsed.data.holdId;
  } else if (holdIdFromQuery) {
    const parsed = releaseHoldSchema.safeParse({ holdId: holdIdFromQuery });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid holdId" }, { status: 400 });
    }
    holdId = parsed.data.holdId;
  } else {
    return NextResponse.json({ error: "holdId is required" }, { status: 400 });
  }

  await releaseSlotHold(holdId);
  return NextResponse.json({ ok: true });
}
