import { type CreateBatchEmailOptions } from "resend";
import { CareersApplicationRejectedEmailTemplate } from "@/components/careers-application-rejected-email-template";
import { CareersApplicationShortlistedEmailTemplate } from "@/components/careers-application-shortlisted-email-template";
import { ApplicationStatus } from "@/generated/prisma/client";
import { getEmailFrom } from "@/lib/email-from";
import { Resend } from "resend";
import {
  RESEND_BATCH_MAX,
  sendResendEmailBatch,
} from "@/lib/resend-batch";

const resend = new Resend(process.env.RESEND_API_KEY);

export { RESEND_BATCH_MAX };

type ApplicationStatusBatchTarget = {
  id: string;
  email: string;
  name: string;
  jobPosting: { title: string };
};

type BulkApplicationStatus =
  | typeof ApplicationStatus.SHORTLISTED
  | typeof ApplicationStatus.REJECTED;

export function buildApplicationStatusBatchEmail(
  target: ApplicationStatusBatchTarget,
  status: BulkApplicationStatus,
): CreateBatchEmailOptions {
  const jobTitle = target.jobPosting.title;
  const base = {
    from: getEmailFrom(),
    to: target.email,
    subject: `Application update — ${jobTitle}`,
  };

  if (status === ApplicationStatus.SHORTLISTED) {
    return {
      ...base,
      react: CareersApplicationShortlistedEmailTemplate({
        candidateName: target.name,
        jobTitle,
      }),
    };
  }

  return {
    ...base,
    react: CareersApplicationRejectedEmailTemplate({
      candidateName: target.name,
      jobTitle,
    }),
  };
}

export async function sendApplicationStatusBatchChunk(
  targets: ApplicationStatusBatchTarget[],
  status: BulkApplicationStatus,
): Promise<void> {
  if (targets.length === 0) return;

  const payloads = targets.map((target) =>
    buildApplicationStatusBatchEmail(target, status),
  );
  const targetIds = targets.map((target) => target.id);

  await sendResendEmailBatch(payloads, "careers-application-bulk", targetIds);
}

export async function sendApplicationStatusChangeEmail(params: {
  status: ApplicationStatus;
  to: string;
  candidateName: string;
  jobTitle: string;
}) {
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(
      "[careers-application-status] RESEND_API_KEY not set; skipping email",
    );
    return;
  }

  if (params.status === ApplicationStatus.SHORTLISTED) {
    await resend.emails.send({
      from: getEmailFrom(),
      to: params.to,
      subject: `Application update — ${params.jobTitle}`,
      react: CareersApplicationShortlistedEmailTemplate({
        candidateName: params.candidateName,
        jobTitle: params.jobTitle,
      }),
    });
    return;
  }

  if (params.status === ApplicationStatus.REJECTED) {
    await resend.emails.send({
      from: getEmailFrom(),
      to: params.to,
      subject: `Application update — ${params.jobTitle}`,
      react: CareersApplicationRejectedEmailTemplate({
        candidateName: params.candidateName,
        jobTitle: params.jobTitle,
      }),
    });
  }
}
