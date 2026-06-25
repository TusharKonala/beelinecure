import { ApplicationStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/careers-admin";
import { sendApplicationStatusChangeEmail } from "@/lib/careers-application-status-email";
import {
  canMarkApplicationAsHired,
  HIRE_BLOCKED_INCOMPLETE_INTERVIEWS_MESSAGE,
} from "@/lib/careers-hire-compose";
import { cancelActiveFutureInterviewRounds } from "@/lib/careers-interview";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  status: z.enum([
    ApplicationStatus.PENDING,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.HIRED,
  ]),
  cancelActiveInterviews: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { applicationId } = await context.params;
  if (!applicationId) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
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

  const existing = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      name: true,
      email: true,
      jobPosting: { select: { title: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (
    parsed.data.status === ApplicationStatus.HIRED &&
    existing.status !== ApplicationStatus.SHORTLISTED
  ) {
    return NextResponse.json(
      { error: "Only shortlisted applications can be marked as hired." },
      { status: 400 },
    );
  }

  if (parsed.data.status === ApplicationStatus.HIRED) {
    const activeRounds = await prisma.interviewRound.findMany({
      where: { applicationId, cancelledAt: null },
      select: { isCompleted: true },
    });
    if (!canMarkApplicationAsHired(activeRounds)) {
      return NextResponse.json(
        { error: HIRE_BLOCKED_INCOMPLETE_INTERVIEWS_MESSAGE },
        { status: 409 },
      );
    }
  }

  if (parsed.data.status === ApplicationStatus.REJECTED) {
    const activeFutureCount = await prisma.interviewRound.count({
      where: {
        applicationId,
        cancelledAt: null,
        scheduledAt: { gt: new Date() },
      },
    });

    if (activeFutureCount > 0 && parsed.data.cancelActiveInterviews !== true) {
      return NextResponse.json(
        {
          error:
            "This candidate has active interviews scheduled. Confirm to cancel them and reject.",
          activeInterviewCount: activeFutureCount,
          requiresInterviewCancellation: true,
        },
        { status: 409 },
      );
    }

    if (parsed.data.cancelActiveInterviews === true) {
      try {
        await cancelActiveFutureInterviewRounds(applicationId);
      } catch (err) {
        console.error(
          "[careers-application-status] Failed to cancel interviews before reject:",
          err,
        );
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? err.message
                : "Failed to cancel scheduled interviews",
          },
          { status: 500 },
        );
      }
    }
  }

  const updated = await prisma.jobApplication.update({
    where: { id: applicationId },
    data: { status: parsed.data.status },
    select: {
      id: true,
      status: true,
    },
  });

  const statusChanged = existing.status !== parsed.data.status;
  if (
    statusChanged &&
    (parsed.data.status === ApplicationStatus.SHORTLISTED ||
      parsed.data.status === ApplicationStatus.REJECTED)
  ) {
    try {
      await sendApplicationStatusChangeEmail({
        status: parsed.data.status,
        to: existing.email,
        candidateName: existing.name,
        jobTitle: existing.jobPosting.title,
      });
    } catch (err) {
      console.error(
        "[careers-application-status] Failed to send status email:",
        err,
      );
    }
  }

  return NextResponse.json({ application: updated });
}
