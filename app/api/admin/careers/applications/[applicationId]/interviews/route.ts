import { ApplicationStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/careers-admin";
import {
  MAX_INTERVIEW_ROUNDS,
  scheduleInterviewSchema,
} from "@/lib/careers-schemas";
import {
  confirmationTokenExpiresAtFromNow,
  generateAttendeeCancelToken,
  generateConfirmationToken,
  sendInterviewInviteEmail,
} from "@/lib/careers-interview";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: auth.session.user.id },
    select: { googleCalendarRefreshToken: true },
  });
  if (!adminUser?.googleCalendarRefreshToken) {
    return NextResponse.json(
      {
        error:
          "Connect Google Calendar in Admin → Settings before scheduling interviews.",
      },
      { status: 400 },
    );
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

  const parsed = scheduleInterviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      name: true,
      email: true,
      candidateTimezone: true,
      jobPosting: { select: { title: true, description: true } },
    },
  });

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (application.status !== ApplicationStatus.SHORTLISTED) {
    return NextResponse.json(
      { error: "Interviews can only be scheduled for shortlisted applications." },
      { status: 400 },
    );
  }

  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Invalid date and time" }, { status: 400 });
  }

  if (scheduledAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Interview time must be in the future." },
      { status: 400 },
    );
  }

  if (parsed.data.roundNumber > MAX_INTERVIEW_ROUNDS) {
    return NextResponse.json(
      { error: `Round number cannot exceed ${MAX_INTERVIEW_ROUNDS}.` },
      { status: 400 },
    );
  }

  const activeRoundWhere = { cancelledAt: null };

  const totalRoundCount = await prisma.interviewRound.count({
    where: { applicationId, ...activeRoundWhere },
  });
  if (totalRoundCount >= MAX_INTERVIEW_ROUNDS) {
    return NextResponse.json(
      {
        error: `Maximum of ${MAX_INTERVIEW_ROUNDS} interview rounds per application.`,
      },
      { status: 400 },
    );
  }

  const conflictingRound = await prisma.interviewRound.findFirst({
    where: {
      applicationId,
      roundNumber: parsed.data.roundNumber,
      ...activeRoundWhere,
    },
    select: { id: true },
  });
  if (conflictingRound) {
    return NextResponse.json(
      { error: "An interview round with this number already exists." },
      { status: 409 },
    );
  }

  const confirmationToken = generateConfirmationToken();
  const attendeeCancelToken = generateAttendeeCancelToken();
  const confirmationTokenExpiresAt = confirmationTokenExpiresAtFromNow();
  const timezone = parsed.data.timezone.trim();

  const round = await prisma.interviewRound.create({
    data: {
      applicationId,
      roundNumber: parsed.data.roundNumber,
      scheduledAt,
      timezone,
      confirmationToken,
      confirmationTokenExpiresAt,
      attendeeCancelToken,
      notes: parsed.data.notes?.trim() || null,
      attendeeEmail: parsed.data.attendeeEmail?.trim() || null,
      jobDescriptionSnapshot: application.jobPosting.description,
      scheduledByAdminId: auth.session.user.id,
    },
  });

  try {
    await sendInterviewInviteEmail({
      to: application.email,
      candidateName: application.name,
      jobTitle: application.jobPosting.title,
      roundNumber: round.roundNumber,
      scheduledAt: round.scheduledAt,
      adminTimezone: timezone,
      candidateTimezone: application.candidateTimezone,
      confirmationToken: round.confirmationToken,
      notes: round.notes,
    });
  } catch (err) {
    console.error("[careers-interview] Failed to send invite email:", err);
    return NextResponse.json(
      { error: "Interview was created but the invitation email failed to send." },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        scheduledAt: round.scheduledAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
