import { Resend, type CreateBatchEmailOptions } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const RESEND_BATCH_MAX = 100;

const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

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

function normalizeToAddress(to: string | string[]): string {
  const address = Array.isArray(to) ? to[0] : to;
  return address.trim().toLowerCase();
}

export function dedupeBatchPayloadsByTo(
  payloads: CreateBatchEmailOptions[],
  logContext: string,
): CreateBatchEmailOptions[] {
  const seen = new Set<string>();
  const deduped: CreateBatchEmailOptions[] = [];

  for (const payload of payloads) {
    const key = normalizeToAddress(payload.to);
    if (seen.has(key)) {
      console.warn(`[${logContext}] Skipping duplicate batch recipient: ${key}`);
      continue;
    }
    seen.add(key);
    deduped.push(payload);
  }

  return deduped;
}

function logPermissiveBatchErrors(
  logContext: string,
  labels: (string | number)[],
  errors: { index: number; message: string }[] | undefined,
): void {
  if (!errors?.length) return;
  for (const err of errors) {
    const label = labels[err.index] ?? err.index;
    console.error(
      `[${logContext}] Batch email validation failed:`,
      label,
      err.message,
    );
  }
}

export async function sendResendEmailBatch(
  payloads: CreateBatchEmailOptions[],
  logContext: string,
  errorLabels?: (string | number)[],
): Promise<void> {
  if (payloads.length === 0) return;

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(`[${logContext}] RESEND_API_KEY not set; skipping batch email`);
    return;
  }

  const labels =
    errorLabels ?? payloads.map((p) => normalizeToAddress(p.to));

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    const response = await resend.batch.send(payloads, {
      batchValidation: "permissive",
    });

    if (!response.error) {
      logPermissiveBatchErrors(
        logContext,
        labels,
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
        `[${logContext}] Rate limited, retrying in ${retryMs}ms (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`,
        labels,
      );
      await sleep(retryMs);
      continue;
    }

    console.error(
      `[${logContext}] Batch send failed:`,
      error.name,
      error.message,
      "recipients:",
      labels,
    );
    return;
  }
}
