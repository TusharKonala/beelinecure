import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/careers-admin";
import { setInterviewRoundCompleted } from "@/lib/careers-interview";
import { interviewCompletionSchema } from "@/lib/careers-schemas";
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

  const parsed = interviewCompletionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const result = await setInterviewRoundCompleted(
    roundId,
    parsed.data.isCompleted,
  );

  if ("error" in result) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }
    if (result.error === "cancelled") {
      return NextResponse.json(
        { error: "Cannot update a cancelled interview" },
        { status: 409 },
      );
    }
    if (result.error === "future_time") {
      return NextResponse.json(
        { error: "Only past interviews can be marked as completed" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, round: result.round });
}
