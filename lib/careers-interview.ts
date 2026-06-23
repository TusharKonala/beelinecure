import { randomBytes } from "crypto";
import { Resend } from "resend";
import { CareersInterviewAttendeeConfirmedEmailTemplate } from "@/components/careers-interview-attendee-confirmed-email-template";
import { CareersInterviewAdminConfirmedEmailTemplate } from "@/components/careers-interview-admin-confirmed-email-template";
import { CareersInterviewInterviewerCancelledAdminEmailTemplate } from "@/components/careers-interview-interviewer-cancelled-admin-email-template";
import { CareersInterviewCancelledAttendeeEmailTemplate } from "@/components/careers-interview-cancelled-attendee-email-template";
import { CareersInterviewCancelledCandidateEmailTemplate } from "@/components/careers-interview-cancelled-candidate-email-template";
import { CareersInterviewConfirmedEmailTemplate } from "@/components/careers-interview-confirmed-email-template";
import { CareersInterviewInviteEmailTemplate } from "@/components/careers-interview-invite-email-template";
import { CareersInterviewRescheduledAttendeeEmailTemplate } from "@/components/careers-interview-rescheduled-attendee-email-template";
import { CareersInterviewRescheduledCandidateEmailTemplate } from "@/components/careers-interview-rescheduled-candidate-email-template";
import { inngest } from "@/inngest/client";
import { formatInterviewTime, isUtcInstantInFuture, isUtcInstantStartedOrPast } from "@/lib/careers-interview-time";
import { getAdminEmails } from "@/lib/careers-admin";
import {
  createMeetEventForInterviewRound,
  deleteAdminInterviewCalendarEvent,
  updateMeetEventForInterviewRound,
} from "@/lib/google-calendar-meet";
import { prisma } from "@/lib/db";
import { getEmailFrom } from "@/lib/email-from";
import {
  interviewReminder24hAtMs,
  interviewReminder30mAtMs,
} from "@/lib/reminder-time";

const resend = new Resend(process.env.RESEND_API_KEY);

const TOKEN_EXPIRY_MS = 48 * 60 * 60 * 1000;

export function resolveJobDescription(
  snapshot: string,
  fallback?: string | null,
): string | null {
  const text = snapshot?.trim() || fallback?.trim();
  return text || null;
}

export function formatInterviewScheduledAt(
  date: Date,
  adminTimezone: string,
  candidateTimezone?: string | null,
) {
  return formatInterviewTime(date, adminTimezone, candidateTimezone);
}

export function resolveAppOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function buildAdminApplicationSearchUrl(candidateEmail: string): string {
  return `${resolveAppOrigin()}/admin/applications?search=${encodeURIComponent(candidateEmail)}`;
}

export function buildAttendeeCancelUrl(attendeeCancelToken: string): string {
  return `${resolveAppOrigin()}/careers/interview/interviewer-cancel?token=${encodeURIComponent(attendeeCancelToken)}`;
}

export function buildAttendeeCancelUrlFromToken(
  attendeeCancelToken: string | null | undefined,
): string | null {
  const token = attendeeCancelToken?.trim();
  if (!token) return null;
  return buildAttendeeCancelUrl(token);
}

export function confirmationTokenExpiresAtFromNow() {
  return new Date(Date.now() + TOKEN_EXPIRY_MS);
}

export function isConfirmationTokenExpired(expiresAt: Date | null | undefined) {
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}

export function isInterviewRoundCancelled(cancelledAt: Date | null | undefined) {
  return cancelledAt != null;
}

export async function cancelInterviewReminders(interviewRoundId: string) {
  try {
    await inngest.send({
      name: "interview/reminder-24h.cancelled",
      data: { interviewRoundId },
    });
  } catch (err) {
    console.error("[careers-interview] Failed to cancel 24h reminder:", err);
  }
  try {
    await inngest.send({
      name: "interview/reminder-30m.cancelled",
      data: { interviewRoundId },
    });
  } catch (err) {
    console.error("[careers-interview] Failed to cancel 30m reminder:", err);
  }
}

export async function scheduleInterviewReminders(roundId: string) {
  const round = await prisma.interviewRound.findUnique({
    where: { id: roundId },
    select: { scheduledAt: true, cancelledAt: true },
  });
  if (!round || round.cancelledAt) return;

  const ts24h = interviewReminder24hAtMs(round.scheduledAt);
  const ts30m = interviewReminder30mAtMs(round.scheduledAt);

  const recipients: Array<"candidate" | "attendee" | "admin"> = [
    "candidate",
    "attendee",
    "admin",
  ];

  for (const recipient of recipients) {
    if (ts24h !== null) {
      try {
        await inngest.send({
          name: "interview/reminder-24h.scheduled",
          data: { interviewRoundId: roundId, recipient },
          ts: ts24h,
        });
      } catch (err) {
        console.error("[careers-interview] Failed to schedule 24h reminder:", err);
      }
    }
    if (ts30m !== null) {
      try {
        await inngest.send({
          name: "interview/reminder-30m.scheduled",
          data: { interviewRoundId: roundId, recipient },
          ts: ts30m,
        });
      } catch (err) {
        console.error("[careers-interview] Failed to schedule 30m reminder:", err);
      }
    }
  }
}

export async function sendInterviewInviteEmail(params: {
  to: string;
  candidateName: string;
  jobTitle: string;
  roundNumber: number;
  scheduledAt: Date;
  adminTimezone: string;
  candidateTimezone?: string | null;
  confirmationToken: string;
  notes?: string | null;
}) {
  const origin = resolveAppOrigin();
  const confirmUrl = `${origin}/careers/interview/confirm?token=${encodeURIComponent(params.confirmationToken)}`;
  const scheduledAtLabel = formatInterviewScheduledAt(
    params.scheduledAt,
    params.adminTimezone,
    params.candidateTimezone,
  );

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn("[careers-interview] RESEND_API_KEY not set; skipping invite email");
    return;
  }

  await resend.emails.send({
    from: getEmailFrom(),
    to: params.to,
    subject: `Confirm your interview — ${params.jobTitle}`,
    react: CareersInterviewInviteEmailTemplate({
      candidateName: params.candidateName,
      jobTitle: params.jobTitle,
      roundNumber: params.roundNumber,
      scheduledAtLabel,
      confirmUrl,
      notes: params.notes,
    }),
  });
}

export async function sendInterviewConfirmedEmail(params: {
  to: string;
  candidateName: string;
  jobTitle: string;
  roundNumber: number;
  scheduledAt: Date;
  adminTimezone: string;
  candidateTimezone?: string | null;
  meetLink: string | null;
}) {
  const scheduledAtLabel = formatInterviewScheduledAt(
    params.scheduledAt,
    params.adminTimezone,
    params.candidateTimezone,
  );

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn("[careers-interview] RESEND_API_KEY not set; skipping confirmed email");
    return;
  }

  await resend.emails.send({
    from: getEmailFrom(),
    to: params.to,
    subject: `Interview confirmed — ${params.jobTitle}`,
    react: CareersInterviewConfirmedEmailTemplate({
      candidateName: params.candidateName,
      jobTitle: params.jobTitle,
      roundNumber: params.roundNumber,
      scheduledAtLabel,
      meetLink: params.meetLink,
    }),
  });
}

export async function sendInterviewAttendeeConfirmedEmail(params: {
  to: string;
  candidateName: string;
  jobTitle: string;
  roundNumber: number;
  scheduledAt: Date;
  adminTimezone: string;
  meetLink: string | null;
  jobDescription?: string | null;
  attendeeCancelToken?: string | null;
}) {
  const scheduledAtLabel = formatInterviewScheduledAt(
    params.scheduledAt,
    params.adminTimezone,
  );
  const cancelUrl = buildAttendeeCancelUrlFromToken(params.attendeeCancelToken);

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(
      "[careers-interview] RESEND_API_KEY not set; skipping attendee confirmed email",
    );
    return;
  }

  await resend.emails.send({
    from: getEmailFrom(),
    to: params.to,
    subject: `Interview scheduled — ${params.jobTitle} (Round ${params.roundNumber})`,
    react: CareersInterviewAttendeeConfirmedEmailTemplate({
      candidateName: params.candidateName,
      jobTitle: params.jobTitle,
      roundNumber: params.roundNumber,
      scheduledAtLabel,
      meetLink: params.meetLink,
      jobDescription: params.jobDescription,
      cancelUrl,
    }),
  });
}

export async function sendInterviewAdminConfirmedEmails(params: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  roundNumber: number;
  scheduledAt: Date;
  adminTimezone: string;
  meetLink: string | null;
}) {
  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) return;

  const scheduledAtLabel = formatInterviewScheduledAt(
    params.scheduledAt,
    params.adminTimezone,
  );
  const applicationUrl = buildAdminApplicationSearchUrl(params.candidateEmail);

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(
      "[careers-interview] RESEND_API_KEY not set; skipping admin confirmed emails",
    );
    return;
  }

  for (const to of adminEmails) {
    try {
      await resend.emails.send({
        from: getEmailFrom(),
        to,
        subject: `Interview confirmed — ${params.jobTitle} (Round ${params.roundNumber})`,
        react: CareersInterviewAdminConfirmedEmailTemplate({
          candidateName: params.candidateName,
          candidateEmail: params.candidateEmail,
          jobTitle: params.jobTitle,
          roundNumber: params.roundNumber,
          scheduledAtLabel,
          meetLink: params.meetLink,
          applicationUrl,
        }),
      });
    } catch (err) {
      console.error(
        `[careers-interview] Failed to send admin confirmed email to ${to}:`,
        err,
      );
    }
  }
}

async function sendInterviewCancelledEmails(round: {
  roundNumber: number;
  scheduledAt: Date;
  timezone: string;
  attendeeEmail: string | null;
  application: {
    name: string;
    email: string;
    candidateTimezone: string | null;
    jobPosting: { title: string };
  };
}) {
  const candidateScheduledAtLabel = formatInterviewScheduledAt(
    round.scheduledAt,
    round.timezone,
    round.application.candidateTimezone,
  );
  const attendeeScheduledAtLabel = formatInterviewScheduledAt(
    round.scheduledAt,
    round.timezone,
  );

  if (!process.env.RESEND_API_KEY?.trim()) return;

  await resend.emails.send({
    from: getEmailFrom(),
    to: round.application.email,
    subject: `Interview cancelled — ${round.application.jobPosting.title}`,
    react: CareersInterviewCancelledCandidateEmailTemplate({
      candidateName: round.application.name,
      jobTitle: round.application.jobPosting.title,
      roundNumber: round.roundNumber,
      scheduledAtLabel: candidateScheduledAtLabel,
    }),
  });

  const attendee = round.attendeeEmail?.trim();
  if (attendee) {
    await resend.emails.send({
      from: getEmailFrom(),
      to: attendee,
      subject: `Interview cancelled — ${round.application.jobPosting.title}`,
      react: CareersInterviewCancelledAttendeeEmailTemplate({
        candidateName: round.application.name,
        jobTitle: round.application.jobPosting.title,
        roundNumber: round.roundNumber,
        scheduledAtLabel: attendeeScheduledAtLabel,
      }),
    });
  }
}

async function sendInterviewRescheduledEmails(params: {
  round: {
    roundNumber: number;
    scheduledAt: Date;
    timezone: string;
    meetLink: string | null;
    confirmationToken: string;
    jobDescriptionSnapshot: string;
    attendeeEmail: string | null;
    attendeeCancelToken?: string | null;
  };
  previousScheduledAt: Date;
  application: {
    name: string;
    email: string;
    candidateTimezone: string | null;
    jobPosting: { title: string; description: string };
  };
  wasConfirmed: boolean;
}) {
  const { round, previousScheduledAt, application, wasConfirmed } = params;
  const jobDescription = resolveJobDescription(
    round.jobDescriptionSnapshot,
    application.jobPosting.description,
  );
  const candidateScheduledAtLabel = formatInterviewScheduledAt(
    round.scheduledAt,
    round.timezone,
    application.candidateTimezone,
  );
  const candidatePreviousScheduledAtLabel = formatInterviewScheduledAt(
    previousScheduledAt,
    round.timezone,
    application.candidateTimezone,
  );
  const attendeeScheduledAtLabel = formatInterviewScheduledAt(
    round.scheduledAt,
    round.timezone,
  );
  const attendeePreviousScheduledAtLabel = formatInterviewScheduledAt(
    previousScheduledAt,
    round.timezone,
  );

  if (!process.env.RESEND_API_KEY?.trim()) return;

  await resend.emails.send({
    from: getEmailFrom(),
    to: application.email,
    subject: `Interview rescheduled — ${application.jobPosting.title}`,
    react: CareersInterviewRescheduledCandidateEmailTemplate({
      candidateName: application.name,
      jobTitle: application.jobPosting.title,
      roundNumber: round.roundNumber,
      previousScheduledAtLabel: candidatePreviousScheduledAtLabel,
      scheduledAtLabel: candidateScheduledAtLabel,
      meetLink: wasConfirmed ? round.meetLink : null,
    }),
  });

  const attendee = round.attendeeEmail?.trim();
  if (attendee) {
    await resend.emails.send({
      from: getEmailFrom(),
      to: attendee,
      subject: `Interview rescheduled — ${application.jobPosting.title}`,
      react: CareersInterviewRescheduledAttendeeEmailTemplate({
        candidateName: application.name,
        jobTitle: application.jobPosting.title,
        roundNumber: round.roundNumber,
        previousScheduledAtLabel: attendeePreviousScheduledAtLabel,
        scheduledAtLabel: attendeeScheduledAtLabel,
        meetLink: wasConfirmed ? round.meetLink : null,
        jobDescription,
      }),
    });
  }
}

export function generateConfirmationToken() {
  return randomBytes(32).toString("hex");
}

export function generateAttendeeCancelToken() {
  return generateConfirmationToken();
}

async function sendInterviewerCancelledAdminEmails(round: {
  roundNumber: number;
  scheduledAt: Date;
  timezone: string;
  application: {
    name: string;
    email: string;
    jobPosting: { title: string };
  };
}) {
  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) return;

  const scheduledAtLabel = formatInterviewScheduledAt(
    round.scheduledAt,
    round.timezone,
  );
  const applicationUrl = buildAdminApplicationSearchUrl(round.application.email);

  if (!process.env.RESEND_API_KEY?.trim()) return;

  for (const to of adminEmails) {
    try {
      await resend.emails.send({
        from: getEmailFrom(),
        to,
        subject: `Interview cancelled by interviewer — ${round.application.jobPosting.title}`,
        react: CareersInterviewInterviewerCancelledAdminEmailTemplate({
          candidateName: round.application.name,
          candidateEmail: round.application.email,
          jobTitle: round.application.jobPosting.title,
          roundNumber: round.roundNumber,
          scheduledAtLabel,
          applicationUrl,
        }),
      });
    } catch (err) {
      console.error(
        `[careers-interview] Failed to send interviewer-cancelled admin email to ${to}:`,
        err,
      );
    }
  }
}

export type AttendeeCancelPreviewStatus =
  | "valid"
  | "interview_started"
  | "invalid_link"
  | "already_cancelled";

export async function getAttendeeCancelPreview(token: string) {
  const round = await prisma.interviewRound.findUnique({
    where: { attendeeCancelToken: token },
    include: {
      application: {
        select: {
          name: true,
          jobPosting: { select: { title: true } },
        },
      },
    },
  });

  if (!round?.attendeeCancelToken) {
    return { status: "invalid_link" as const };
  }
  if (round.cancelledAt) {
    return { status: "already_cancelled" as const };
  }
  if (isUtcInstantStartedOrPast(round.scheduledAt)) {
    return { status: "interview_started" as const };
  }

  return {
    status: "valid" as const,
    jobTitle: round.application.jobPosting.title,
    candidateName: round.application.name,
    roundNumber: round.roundNumber,
    scheduledAtLabel: formatInterviewScheduledAt(
      round.scheduledAt,
      round.timezone,
    ),
  };
}

export async function cancelInterviewRoundByAttendeeToken(token: string) {
  const round = await prisma.interviewRound.findUnique({
    where: { attendeeCancelToken: token },
    include: {
      application: {
        select: {
          name: true,
          email: true,
          candidateTimezone: true,
          jobPosting: { select: { title: true, description: true } },
        },
      },
    },
  });

  if (!round?.attendeeCancelToken) {
    return { status: "invalid_link" as const };
  }
  if (round.cancelledAt) {
    return { status: "already_cancelled" as const };
  }
  if (!isUtcInstantInFuture(round.scheduledAt)) {
    return { status: "interview_started" as const };
  }

  const result = await cancelInterviewRound(round.id);
  if ("error" in result) {
    if (result.error === "already_cancelled") {
      return { status: "already_cancelled" as const };
    }
    return { status: "invalid_link" as const };
  }

  try {
    await sendInterviewerCancelledAdminEmails(round);
  } catch (err) {
    console.error(
      "[careers-interview] Failed to send interviewer-cancelled admin emails:",
      err,
    );
  }

  return { status: "success" as const };
}

export async function cancelInterviewRound(roundId: string) {
  const round = await prisma.interviewRound.findUnique({
    where: { id: roundId },
    include: {
      application: {
        select: {
          name: true,
          email: true,
          candidateTimezone: true,
          jobPosting: { select: { title: true, description: true } },
        },
      },
    },
  });

  if (!round) {
    return { error: "not_found" as const };
  }
  if (round.cancelledAt) {
    return { error: "already_cancelled" as const };
  }

  const wasConfirmed = Boolean(round.confirmedAt);

  await prisma.interviewRound.update({
    where: { id: roundId },
    data: { cancelledAt: new Date() },
  });

  if (wasConfirmed) {
    await cancelInterviewReminders(roundId);
    await deleteAdminInterviewCalendarEvent(
      round.scheduledByAdminId,
      round.googleCalendarEventId,
    );

    try {
      await sendInterviewCancelledEmails(round);
    } catch (err) {
      console.error("[careers-interview] Failed to send cancellation emails:", err);
    }
  }

  return { ok: true as const };
}

export async function cancelActiveFutureInterviewRounds(applicationId: string) {
  const rounds = await prisma.interviewRound.findMany({
    where: {
      applicationId,
      cancelledAt: null,
      scheduledAt: { gt: new Date() },
    },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
  });

  for (const round of rounds) {
    const result = await cancelInterviewRound(round.id);
    if ("error" in result && result.error !== "already_cancelled") {
      throw new Error(
        result.error === "not_found"
          ? "Interview round not found while cancelling"
          : "Failed to cancel interview round",
      );
    }
  }

  return { cancelledCount: rounds.length };
}

export type RescheduleInterviewInput = {
  scheduledAt: Date;
  timezone: string;
  notes?: string | null;
  attendeeEmail?: string | null;
};

export async function rescheduleInterviewRound(
  roundId: string,
  input: RescheduleInterviewInput,
) {
  const round = await prisma.interviewRound.findUnique({
    where: { id: roundId },
    include: {
      application: {
        select: {
          name: true,
          email: true,
          candidateTimezone: true,
          jobPosting: { select: { title: true, description: true } },
        },
      },
    },
  });

  if (!round) {
    return { error: "not_found" as const };
  }
  if (round.cancelledAt) {
    return { error: "cancelled" as const };
  }

  const notes = input.notes?.trim() || null;
  const attendeeEmail = input.attendeeEmail?.trim() || null;
  const timezone = input.timezone.trim();

  const unchanged =
    round.scheduledAt.getTime() === input.scheduledAt.getTime() &&
    round.timezone === timezone &&
    (round.notes?.trim() || null) === notes &&
    (round.attendeeEmail?.trim() || null) === attendeeEmail;

  if (unchanged) {
    return { error: "unchanged" as const };
  }

  if (input.scheduledAt.getTime() <= Date.now()) {
    return { error: "past_time" as const };
  }

  const previousScheduledAt = round.scheduledAt;
  const wasConfirmed = Boolean(round.confirmedAt);

  const updated = await prisma.interviewRound.update({
    where: { id: roundId },
    data: {
      scheduledAt: input.scheduledAt,
      timezone,
      notes,
      attendeeEmail,
      attendeeCancelToken: generateAttendeeCancelToken(),
      ...(!wasConfirmed
        ? { confirmationTokenExpiresAt: confirmationTokenExpiresAtFromNow() }
        : {}),
    },
  });

  if (wasConfirmed) {
    await cancelInterviewReminders(roundId);
    await updateMeetEventForInterviewRound(roundId);
    await scheduleInterviewReminders(roundId);

    try {
      await sendInterviewRescheduledEmails({
        round: {
          roundNumber: updated.roundNumber,
          scheduledAt: updated.scheduledAt,
          timezone: updated.timezone,
          meetLink: updated.meetLink,
          confirmationToken: updated.confirmationToken,
          jobDescriptionSnapshot: updated.jobDescriptionSnapshot,
          attendeeEmail: updated.attendeeEmail,
          attendeeCancelToken: updated.attendeeCancelToken,
        },
        previousScheduledAt,
        application: round.application,
        wasConfirmed: true,
      });
    } catch (err) {
      console.error("[careers-interview] Failed to send reschedule emails:", err);
    }
  } else {
    try {
      await sendInterviewInviteEmail({
        to: round.application.email,
        candidateName: round.application.name,
        jobTitle: round.application.jobPosting.title,
        roundNumber: updated.roundNumber,
        scheduledAt: updated.scheduledAt,
        adminTimezone: timezone,
        candidateTimezone: round.application.candidateTimezone,
        confirmationToken: updated.confirmationToken,
        notes: updated.notes,
      });
    } catch (err) {
      console.error(
        "[careers-interview] Failed to send updated invite email:",
        err,
      );
    }
  }

  return { ok: true as const, round: updated };
}

export async function confirmInterviewRound(token: string) {
  const round = await prisma.interviewRound.findUnique({
    where: { confirmationToken: token },
    include: {
      application: {
        select: {
          name: true,
          email: true,
          candidateTimezone: true,
          jobPosting: { select: { title: true, description: true } },
        },
      },
    },
  });

  if (!round) {
    return { error: "invalid_token" as const };
  }

  if (isInterviewRoundCancelled(round.cancelledAt)) {
    return { error: "cancelled" as const };
  }

  if (isConfirmationTokenExpired(round.confirmationTokenExpiresAt)) {
    return { error: "expired_token" as const };
  }

  const adminTimezone = round.timezone;
  const candidateTimezone = round.application.candidateTimezone;
  const jobDescription = resolveJobDescription(
    round.jobDescriptionSnapshot,
    round.application.jobPosting.description,
  );

  if (round.confirmedAt) {
    return {
      ok: true as const,
      alreadyConfirmed: true,
      round: {
        jobTitle: round.application.jobPosting.title,
        candidateName: round.application.name,
        roundNumber: round.roundNumber,
        scheduledAt: round.scheduledAt.toISOString(),
        scheduledAtLabel: formatInterviewScheduledAt(
          round.scheduledAt,
          adminTimezone,
          candidateTimezone,
        ),
        meetLink: round.meetLink,
        confirmedAt: round.confirmedAt.toISOString(),
      },
    };
  }

  const confirmedAt = new Date();
  await prisma.interviewRound.update({
    where: { id: round.id },
    data: { confirmedAt },
  });

  const { meetLink } = await createMeetEventForInterviewRound(round.id);

  const updated = await prisma.interviewRound.findUnique({
    where: { id: round.id },
    select: { meetLink: true, attendeeEmail: true, attendeeCancelToken: true },
  });

  const finalMeetLink = updated?.meetLink ?? meetLink;

  try {
    await sendInterviewConfirmedEmail({
      to: round.application.email,
      candidateName: round.application.name,
      jobTitle: round.application.jobPosting.title,
      roundNumber: round.roundNumber,
      scheduledAt: round.scheduledAt,
      adminTimezone,
      candidateTimezone,
      meetLink: finalMeetLink,
    });
  } catch (err) {
    console.error("[careers-interview] Failed to send confirmed email:", err);
  }

  const attendeeEmail = updated?.attendeeEmail?.trim();
  if (attendeeEmail) {
    try {
      await sendInterviewAttendeeConfirmedEmail({
        to: attendeeEmail,
        candidateName: round.application.name,
        jobTitle: round.application.jobPosting.title,
        roundNumber: round.roundNumber,
        scheduledAt: round.scheduledAt,
        adminTimezone,
        meetLink: finalMeetLink,
        jobDescription,
        attendeeCancelToken: updated?.attendeeCancelToken,
      });
    } catch (err) {
      console.error(
        "[careers-interview] Failed to send attendee confirmed email:",
        err,
      );
    }
  }

  try {
    await sendInterviewAdminConfirmedEmails({
      candidateName: round.application.name,
      candidateEmail: round.application.email,
      jobTitle: round.application.jobPosting.title,
      roundNumber: round.roundNumber,
      scheduledAt: round.scheduledAt,
      adminTimezone,
      meetLink: finalMeetLink,
    });
  } catch (err) {
    console.error("[careers-interview] Failed to send admin confirmed emails:", err);
  }

  try {
    await scheduleInterviewReminders(round.id);
  } catch (err) {
    console.error("[careers-interview] Failed to schedule reminders:", err);
  }

  return {
    ok: true as const,
    alreadyConfirmed: false,
    round: {
      jobTitle: round.application.jobPosting.title,
      candidateName: round.application.name,
      roundNumber: round.roundNumber,
      scheduledAt: round.scheduledAt.toISOString(),
      scheduledAtLabel: formatInterviewScheduledAt(
        round.scheduledAt,
        adminTimezone,
        candidateTimezone,
      ),
      meetLink: finalMeetLink,
      confirmedAt: confirmedAt.toISOString(),
    },
  };
}
