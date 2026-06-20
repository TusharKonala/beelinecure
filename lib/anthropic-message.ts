import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";

export function parseJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

export async function callAnthropicWithRetry(
  params: Anthropic.MessageCreateParamsNonStreaming,
  maxAttempts = 3,
  logPrefix = "[anthropic]",
): Promise<Anthropic.Message> {
  let waitMs = 1000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      lastError = err;
      if (status !== 529 || attempt === maxAttempts) {
        throw err;
      }
      console.warn(
        `${logPrefix} Anthropic 529 (attempt ${attempt}/${maxAttempts}); waiting ${waitMs}ms`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      waitMs *= 2;
    }
  }
  throw lastError;
}
