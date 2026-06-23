import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/careers-admin";
import { rescheduleInterviewSchema } from "@/lib/careers-schemas";
import { rescheduleInterviewRound } from "@/lib/careers-interview";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ applicationId: string; roundId: string }>;
  },
) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { applicationId, roundId } = await context.params;
  if (!applicationId || !roundId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await prisma.interviewRound.findFirst({
    where: { id: roundId, applicationId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = rescheduleInterviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Invalid date and time" }, { status: 400 });
  }

  const result = await rescheduleInterviewRound(roundId, {
    scheduledAt,
    timezone: parsed.data.timezone.trim(),
    notes: parsed.data.notes,
    attendeeEmail: parsed.data.attendeeEmail,
    attendeeName: parsed.data.attendeeName,
  });

  if ("error" in result) {
    if (result.error === "unchanged") {
      return NextResponse.json({ error: "No changes to save" }, { status: 400 });
    }
    if (result.error === "past_time") {
      return NextResponse.json(
        { error: "Interview time must be in the future" },
        { status: 400 },
      );
    }
    if (result.error === "cancelled") {
      return NextResponse.json(
        { error: "Cannot reschedule a cancelled interview" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    round: {
      id: result.round.id,
      roundNumber: result.round.roundNumber,
      scheduledAt: result.round.scheduledAt.toISOString(),
    },
  });
}
