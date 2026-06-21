import { ApplicationStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/careers-admin";
import { countBulkPendingTargets } from "@/lib/careers-application-bulk";
import { isValidScoreBandRange } from "@/lib/careers-applications-query";
import { inngest } from "@/inngest/client";

const patchSchema = z.object({
  status: z.enum([
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
  ]),
  scoreMin: z.number().int(),
  scoreMax: z.number().int(),
});

export async function PATCH(request: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { status, scoreMin, scoreMax } = parsed.data;
  if (!isValidScoreBandRange(scoreMin, scoreMax)) {
    return NextResponse.json(
      { error: "Invalid score band range" },
      { status: 400 },
    );
  }

  const count = await countBulkPendingTargets(scoreMin, scoreMax);
  if (count === 0) {
    return NextResponse.json({ updatedCount: 0, queued: false });
  }

  try {
    await inngest.send({
      name: "admin/careers.bulk-update-applications",
      data: { status, scoreMin, scoreMax },
    });
  } catch (err) {
    console.error("[careers-application-bulk] Failed to queue bulk update:", err);
    return NextResponse.json(
      {
        error:
          "Could not start bulk update. Please try again in a moment.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ queued: true, count }, { status: 202 });
}
