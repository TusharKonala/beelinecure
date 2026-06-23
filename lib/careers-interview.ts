import { randomBytes } from "crypto";
import { Resend, type CreateBatchEmailOptions } from "resend";
import { CareersInterviewAttendeeConfirmedEmailTemplate } from "@/components/careers-interview-attendee-confirmed-email-template";
import { CareersInterviewAdminConfirmedEmailTemplate } from "@/components/careers-interview-admin-confirmed-email-template";
import { CareersInterviewAdminReminderEmailTemplate } from "@/components/careers-interview-admin-reminder-email-template";
import { CareersInterviewInterviewerCancelledAdminEmailTemplate } from "@/components/careers-interview-interviewer-cancelled-admin-email-template";
import { CareersInterviewCancelledAttendeeEmailTemplate } from "@/components/careers-interview-cancelled-attendee-email-template";
import { CareersInterviewCancelledCandidateEmailTemplate } from "@/components/careers-interview-cancelled-candidate-email-template";
import { CareersInterviewConfirmedEmailTemplate } from "@/components/careers-interview-confirmed-email-template";
import { CareersInterviewInviteEmailTemplate } from "@/components/careers-interview-invite-email-template";
import { CareersInterviewReminderEmailTemplate } from "@/components/careers-interview-reminder-email-template";
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
  dedupeBatchPayloadsByTo,
  sendResendEmailBatch,
} from "@/lib/resend-batch";
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
  const params = new URLSearchParams({
    search: candidateEmail,
    status: "SHORTLISTED",
  });
  return `${resolveAppOrigin()}/admin/applications?${params.toString()}`;
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

  if (ts24h !== null) {
    try {
      await inngest.send({
        name: "interview/reminder-24h.scheduled",
        data: { interviewRoundId: roundId },
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
        data: { interviewRoundId: roundId },
        ts: ts30m,
      });
    } catch (err) {
      console.error("[careers-interview] Failed to schedule 30m reminder:", err);
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

export function formatAttendeeGreeting(
  attendeeName: string | null | undefined,
): string {
  const name = attendeeName?.trim();
  return name || "there";
}

export type InterviewReminderRecipient = "candidate" | "attendee" | "admin";

const interviewRoundReminderSelect = {
  id: true,
  roundNumber: true,
  scheduledAt: true,
  timezone: true,
  meetLink: true,
  confirmedAt: true,
  cancelledAt: true,
  jobDescriptionSnapshot: true,
  attendeeEmail: true,
  attendeeName: true,
  attendeeCancelToken: true,
  application: {
    select: {
      name: true,
      email: true,
      candidateTimezone: true,
      jobPosting: { select: { title: true, description: true } },
    },
  },
} as const;

async function loadInterviewRoundForReminder(interviewRoundId: string) {
  return prisma.interviewRound.findUnique({
    where: { id: interviewRoundId },
    select: interviewRoundReminderSelect,
  });
}

export async function sendInterviewConfirmedEmailsBatch(params: {
  candidateEmail: string;
  candidateName: string;
  candidateTimezone: string | null;
  jobTitle: string;
  roundNumber: number;
  scheduledAt: Date;
  adminTimezone: string;
  meetLink: string | null;
  jobDescription?: string | null;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
  attendeeCancelToken?: string | null;
}) {
  const scheduledAtLabelCandidate = formatInterviewScheduledAt(
    params.scheduledAt,
    params.adminTimezone,
    params.candidateTimezone,
  );
  const scheduledAtLabelAttendee = formatInterviewScheduledAt(
    params.scheduledAt,
    params.adminTimezone,
  );
  const applicationUrl = buildAdminApplicationSearchUrl(params.candidateEmail);
  const from = getEmailFrom();
  const payloads: CreateBatchEmailOptions[] = [
    {
      from,
      to: params.candidateEmail,
      subject: `Interview confirmed — ${params.jobTitle}`,
      react: CareersInterviewConfirmedEmailTemplate({
        candidateName: params.candidateName,
        jobTitle: params.jobTitle,
        roundNumber: params.roundNumber,
        scheduledAtLabel: scheduledAtLabelCandidate,
        meetLink: params.meetLink,
      }),
    },
  ];

  const attendeeEmail = params.attendeeEmail?.trim();
  if (attendeeEmail) {
    payloads.push({
      from,
      to: attendeeEmail,
      subject: `Interview scheduled — ${params.jobTitle} (Round ${params.roundNumber})`,
      react: CareersInterviewAttendeeConfirmedEmailTemplate({
        attendeeName: formatAttendeeGreeting(params.attendeeName),
        candidateName: params.candidateName,
        jobTitle: params.jobTitle,
        roundNumber: params.roundNumber,
        scheduledAtLabel: scheduledAtLabelAttendee,
        meetLink: params.meetLink,
        jobDescription: params.jobDescription,
        cancelUrl: buildAttendeeCancelUrlFromToken(params.attendeeCancelToken),
      }),
    });
  }

  const adminEmails = await getAdminEmails();
  for (const to of adminEmails) {
    payloads.push({
      from,
      to,
      subject: `Interview confirmed — ${params.jobTitle} (Round ${params.roundNumber})`,
      react: CareersInterviewAdminConfirmedEmailTemplate({
        candidateName: params.candidateName,
        candidateEmail: params.candidateEmail,
        interviewerName: params.attendeeName?.trim() || null,
        interviewerEmail: params.attendeeEmail?.trim() || null,
        jobTitle: params.jobTitle,
        roundNumber: params.roundNumber,
        scheduledAtLabel: scheduledAtLabelAttendee,
        meetLink: params.meetLink,
        applicationUrl,
      }),
    });
  }

  const deduped = dedupeBatchPayloadsByTo(payloads, "interview-confirmed");
  await sendResendEmailBatch(deduped, "interview-confirmed");
}

/** Legacy single-recipient reminder (pre-batch Inngest events with `recipient` in payload). */
export async function sendInterviewReminderEmail(params: {
  interviewRoundId: string;
  recipient: InterviewReminderRecipient;
  reminderLabel: string;
}) {
  const round = await loadInterviewRoundForReminder(params.interviewRoundId);

  if (!round?.confirmedAt || round.cancelledAt) {
    return {
      skipped: true,
      reason: round?.cancelledAt ? "cancelled" : "not_confirmed",
    };
  }

  const jobDescription = resolveJobDescription(
    round.jobDescriptionSnapshot,
    round.application.jobPosting.description,
  );

  const scheduledAtLabel = formatInterviewScheduledAt(
    round.scheduledAt,
    round.timezone,
    params.recipient === "candidate"
      ? round.application.candidateTimezone
      : undefined,
  );

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn("[interview-reminder] RESEND_API_KEY not set");
    return { skipped: true, reason: "no_resend_key" };
  }

  const from = getEmailFrom();

  if (params.recipient === "admin") {
    const adminEmails = await getAdminEmails();
    if (adminEmails.length === 0) {
      return { skipped: true, reason: "no_recipient" };
    }

    const applicationUrl = buildAdminApplicationSearchUrl(
      round.application.email,
    );

    for (const to of adminEmails) {
      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject: `Interview reminder (${params.reminderLabel}) — ${round.application.jobPosting.title}`,
          react: CareersInterviewAdminReminderEmailTemplate({
            jobTitle: round.application.jobPosting.title,
            candidateName: round.application.name,
            candidateEmail: round.application.email,
            interviewerName: round.attendeeName?.trim() || null,
            interviewerEmail: round.attendeeEmail?.trim() || null,
            roundNumber: round.roundNumber,
            scheduledAtLabel,
            meetLink: round.meetLink,
            reminderLabel: params.reminderLabel,
            applicationUrl,
          }),
        });
        if (error) {
          console.error(
            `[interview-reminder] Admin email failed for ${to}: ${JSON.stringify(error)}`,
          );
        }
      } catch (err) {
        console.error(
          `[interview-reminder] Admin email failed for ${to}:`,
          err,
        );
      }
    }

    return { sent: true, interviewRoundId: params.interviewRoundId };
  }

  const to =
    params.recipient === "attendee"
      ? round.attendeeEmail?.trim()
      : round.application.email;

  if (!to) {
    return { skipped: true, reason: "no_recipient" };
  }

  const recipientName =
    params.recipient === "attendee"
      ? round.attendeeName?.trim() || "there"
      : round.application.name;

  const cancelUrl =
    params.recipient === "attendee"
      ? buildAttendeeCancelUrlFromToken(round.attendeeCancelToken)
      : null;

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Interview reminder (${params.reminderLabel}) — ${round.application.jobPosting.title}`,
    react: CareersInterviewReminderEmailTemplate({
      recipientName,
      jobTitle: round.application.jobPosting.title,
      roundNumber: round.roundNumber,
      scheduledAtLabel,
      meetLink: round.meetLink,
      reminderLabel: params.reminderLabel,
      jobDescription:
        params.recipient === "attendee" ? jobDescription : undefined,
      cancelUrl,
    }),
  });

  if (error) {
    console.error(
      `[interview-reminder] Email failed: ${JSON.stringify(error)}`,
    );
    throw new Error("reminder_email_failed");
  }

  return { sent: true, interviewRoundId: params.interviewRoundId };
}

export async function sendInterviewReminderEmailsBatch(
  interviewRoundId: string,
  reminderLabel: string,
) {
  const round = await loadInterviewRoundForReminder(interviewRoundId);

  if (!round?.confirmedAt || round.cancelledAt) {
    return {
      skipped: true,
      reason: round?.cancelledAt ? "cancelled" : "not_confirmed",
    };
  }

  const jobDescription = resolveJobDescription(
    round.jobDescriptionSnapshot,
    round.application.jobPosting.description,
  );

  const from = getEmailFrom();
  const jobTitle = round.application.jobPosting.title;
  const subject = `Interview reminder (${reminderLabel}) — ${jobTitle}`;
  const applicationUrl = buildAdminApplicationSearchUrl(round.application.email);

  const payloads: CreateBatchEmailOptions[] = [
    {
      from,
      to: round.application.email,
      subject,
      react: CareersInterviewReminderEmailTemplate({
        recipientName: round.application.name,
        jobTitle,
        roundNumber: round.roundNumber,
        scheduledAtLabel: formatInterviewScheduledAt(
          round.scheduledAt,
          round.timezone,
          round.application.candidateTimezone,
        ),
        meetLink: round.meetLink,
        reminderLabel,
      }),
    },
  ];

  const attendeeEmail = round.attendeeEmail?.trim();
  if (attendeeEmail) {
    payloads.push({
      from,
      to: attendeeEmail,
      subject,
      react: CareersInterviewReminderEmailTemplate({
        recipientName: round.attendeeName?.trim() || "there",
        jobTitle,
        roundNumber: round.roundNumber,
        scheduledAtLabel: formatInterviewScheduledAt(
          round.scheduledAt,
          round.timezone,
        ),
        meetLink: round.meetLink,
        reminderLabel,
        jobDescription,
        cancelUrl: buildAttendeeCancelUrlFromToken(round.attendeeCancelToken),
      }),
    });
  }

  const adminEmails = await getAdminEmails();
  const adminScheduledAtLabel = formatInterviewScheduledAt(
    round.scheduledAt,
    round.timezone,
  );
  for (const to of adminEmails) {
    payloads.push({
      from,
      to,
      subject,
      react: CareersInterviewAdminReminderEmailTemplate({
        jobTitle,
        candidateName: round.application.name,
        candidateEmail: round.application.email,
        interviewerName: round.attendeeName?.trim() || null,
        interviewerEmail: round.attendeeEmail?.trim() || null,
        roundNumber: round.roundNumber,
        scheduledAtLabel: adminScheduledAtLabel,
        meetLink: round.meetLink,
        reminderLabel,
        applicationUrl,
      }),
    });
  }

  const deduped = dedupeBatchPayloadsByTo(payloads, "interview-reminder");
  await sendResendEmailBatch(deduped, "interview-reminder");

  return { sent: true, interviewRoundId };
}

type InterviewCancelledRound = {
  roundNumber: number;
  scheduledAt: Date;
  timezone: string;
  attendeeEmail: string | null;
  attendeeName: string | null;
  application: {
    name: string;
    email: string;
    candidateTimezone: string | null;
    jobPosting: { title: string };
  };
};

function buildInterviewCancelledParticipantPayloads(
  round: InterviewCancelledRound,
): CreateBatchEmailOptions[] {
  const from = getEmailFrom();
  const jobTitle = round.application.jobPosting.title;
  const candidateScheduledAtLabel = formatInterviewScheduledAt(
    round.scheduledAt,
    round.timezone,
    round.application.candidateTimezone,
  );
  const attendeeScheduledAtLabel = formatInterviewScheduledAt(
    round.scheduledAt,
    round.timezone,
  );

  const payloads: CreateBatchEmailOptions[] = [
    {
      from,
      to: round.application.email,
      subject: `Interview cancelled — ${jobTitle}`,
      react: CareersInterviewCancelledCandidateEmailTemplate({
        candidateName: round.application.name,
        jobTitle,
        roundNumber: round.roundNumber,
        scheduledAtLabel: candidateScheduledAtLabel,
      }),
    },
  ];

  const attendee = round.attendeeEmail?.trim();
  if (attendee) {
    payloads.push({
      from,
      to: attendee,
      subject: `Interview cancelled — ${jobTitle}`,
      react: CareersInterviewCancelledAttendeeEmailTemplate({
        attendeeName: formatAttendeeGreeting(round.attendeeName),
        candidateName: round.application.name,
        jobTitle,
        roundNumber: round.roundNumber,
        scheduledAtLabel: attendeeScheduledAtLabel,
      }),
    });
  }

  return payloads;
}

async function sendInterviewCancelledEmailsBatch(round: InterviewCancelledRound) {
  const payloads = buildInterviewCancelledParticipantPayloads(round);
  const deduped = dedupeBatchPayloadsByTo(payloads, "interview-cancelled");
  await sendResendEmailBatch(deduped, "interview-cancelled");
}

async function sendInterviewerCancelledEmailsBatch(
  round: InterviewCancelledRound,
  includeParticipantCancellationEmails: boolean,
) {
  const from = getEmailFrom();
  const jobTitle = round.application.jobPosting.title;
  const scheduledAtLabel = formatInterviewScheduledAt(
    round.scheduledAt,
    round.timezone,
  );
  const applicationUrl = buildAdminApplicationSearchUrl(round.application.email);

  const payloads: CreateBatchEmailOptions[] =
    includeParticipantCancellationEmails
      ? buildInterviewCancelledParticipantPayloads(round)
      : [];

  const adminEmails = await getAdminEmails();
  for (const to of adminEmails) {
    payloads.push({
      from,
      to,
      subject: `Interview cancelled by interviewer — ${jobTitle}`,
      react: CareersInterviewInterviewerCancelledAdminEmailTemplate({
        candidateName: round.application.name,
        candidateEmail: round.application.email,
        interviewerName: round.attendeeName?.trim() || null,
        interviewerEmail: round.attendeeEmail?.trim() || null,
        jobTitle,
        roundNumber: round.roundNumber,
        scheduledAtLabel,
        applicationUrl,
      }),
    });
  }

  const deduped = dedupeBatchPayloadsByTo(
    payloads,
    "interview-cancelled-by-interviewer",
  );
  await sendResendEmailBatch(deduped, "interview-cancelled-by-interviewer");
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
    attendeeName: string | null;
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
        attendeeName: formatAttendeeGreeting(round.attendeeName),
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

  const wasConfirmed = Boolean(round.confirmedAt);

  const result = await cancelInterviewRound(round.id, {
    skipParticipantCancellationEmails: true,
  });
  if ("error" in result) {
    if (result.error === "already_cancelled") {
      return { status: "already_cancelled" as const };
    }
    return { status: "invalid_link" as const };
  }

  try {
    await sendInterviewerCancelledEmailsBatch(round, wasConfirmed);
  } catch (err) {
    console.error(
      "[careers-interview] Failed to send interviewer-cancelled emails:",
      err,
    );
  }

  return { status: "success" as const };
}

export async function cancelInterviewRound(
  roundId: string,
  options?: { skipParticipantCancellationEmails?: boolean },
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

    if (!options?.skipParticipantCancellationEmails) {
      try {
        await sendInterviewCancelledEmailsBatch(round);
      } catch (err) {
        console.error(
          "[careers-interview] Failed to send cancellation emails:",
          err,
        );
      }
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
  attendeeName?: string | null;
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
  const attendeeName = input.attendeeName?.trim() || null;
  const timezone = input.timezone.trim();

  const unchanged =
    round.scheduledAt.getTime() === input.scheduledAt.getTime() &&
    round.timezone === timezone &&
    (round.notes?.trim() || null) === notes &&
    (round.attendeeEmail?.trim() || null) === attendeeEmail &&
    (round.attendeeName?.trim() || null) === attendeeName;

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
      attendeeName,
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
          attendeeName: updated.attendeeName,
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
    select: { meetLink: true, attendeeEmail: true, attendeeName: true, attendeeCancelToken: true },
  });

  const finalMeetLink = updated?.meetLink ?? meetLink;

  try {
    await sendInterviewConfirmedEmailsBatch({
      candidateEmail: round.application.email,
      candidateName: round.application.name,
      candidateTimezone: round.application.candidateTimezone,
      jobTitle: round.application.jobPosting.title,
      roundNumber: round.roundNumber,
      scheduledAt: round.scheduledAt,
      adminTimezone,
      meetLink: finalMeetLink,
      jobDescription,
      attendeeEmail: updated?.attendeeEmail,
      attendeeName: updated?.attendeeName,
      attendeeCancelToken: updated?.attendeeCancelToken,
    });
  } catch (err) {
    console.error("[careers-interview] Failed to send confirmed emails:", err);
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
