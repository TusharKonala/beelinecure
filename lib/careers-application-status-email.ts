import { Resend, type CreateBatchEmailOptions } from "resend";
import { CareersApplicationRejectedEmailTemplate } from "@/components/careers-application-rejected-email-template";
import { CareersApplicationShortlistedEmailTemplate } from "@/components/careers-application-shortlisted-email-template";
import { ApplicationStatus } from "@/generated/prisma/client";
import { getEmailFrom } from "@/lib/email-from";

const resend = new Resend(process.env.RESEND_API_KEY);

export const RESEND_BATCH_MAX = 100;

const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

type ApplicationStatusBatchTarget = {
  id: string;
  email: string;
  name: string;
  jobPosting: { title: string };
};

type BulkApplicationStatus =
  | typeof ApplicationStatus.SHORTLISTED
  | typeof ApplicationStatus.REJECTED;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: {
  name: string;
  statusCode: number | null;
}): boolean {
  return error.name === "rate_limit_exceeded" || error.statusCode === 429;
}

function parseRetryAfterMs(headers: Record<string, string> | null): number | null {
  if (!headers) return null;
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return null;
}

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

function logPermissiveBatchErrors(
  targets: ApplicationStatusBatchTarget[],
  errors: { index: number; message: string }[] | undefined,
): void {
  if (!errors?.length) return;
  for (const err of errors) {
    const target = targets[err.index];
    console.error(
      "[careers-application-bulk] Batch email validation failed:",
      target?.id ?? err.index,
      err.message,
    );
  }
}

export async function sendApplicationStatusBatchChunk(
  targets: ApplicationStatusBatchTarget[],
  status: BulkApplicationStatus,
): Promise<void> {
  if (targets.length === 0) return;

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(
      "[careers-application-status] RESEND_API_KEY not set; skipping email",
    );
    return;
  }

  const payloads = targets.map((target) =>
    buildApplicationStatusBatchEmail(target, status),
  );
  const targetIds = targets.map((target) => target.id);

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    const response = await resend.batch.send(payloads, {
      batchValidation: "permissive",
    });

    if (!response.error) {
      logPermissiveBatchErrors(
        targets,
        (response.data as { errors?: { index: number; message: string }[] })
          ?.errors,
      );
      return;
    }

    const { error } = response;
    if (isRateLimitError(error) && attempt < RATE_LIMIT_MAX_RETRIES) {
      const retryMs =
        parseRetryAfterMs(response.headers) ??
        RATE_LIMIT_BASE_DELAY_MS * (attempt + 1);
      console.warn(
        `[careers-application-bulk] Rate limited, retrying in ${retryMs}ms (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`,
        targetIds,
      );
      await sleep(retryMs);
      continue;
    }

    console.error(
      "[careers-application-bulk] Batch send failed:",
      error.name,
      error.message,
      "applicationIds:",
      targetIds,
    );
    return;
  }
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
