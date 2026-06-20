import { z } from "zod";
import {
  callAnthropicWithRetry,
  parseJsonFromModelText,
} from "@/lib/anthropic-message";

const contactResultSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export type ResumeContactFields = z.infer<typeof contactResultSchema>;

const emptyContact: ResumeContactFields = {
  name: null,
  email: null,
  phone: null,
};

export async function extractContactFromResumeText(
  resumeText: string,
): Promise<ResumeContactFields> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("[careers-contact] ANTHROPIC_API_KEY is not configured");
    return emptyContact;
  }

  try {
    const message = await callAnthropicWithRetry(
      {
        model: "claude-haiku-4-5",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `Resume text:\n${resumeText}\n\nExtract the candidate's contact details from this resume. Respond with only a JSON object with exactly these fields:\n- name: string or null (full name)\n- email: string or null\n- phone: string or null (prefer E.164 format, e.g. +14155552671)\nUse null for any field not found or uncertain.`,
          },
        ],
      },
      3,
      "[careers-contact]",
    );

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[careers-contact] No text in model response");
      return emptyContact;
    }

    const raw = parseJsonFromModelText(textBlock.text);
    const parsed = contactResultSchema.parse(raw);
    return {
      name: parsed.name?.trim() || null,
      email: parsed.email?.trim() || null,
      phone: parsed.phone?.trim() || null,
    };
  } catch (err) {
    console.error("[careers-contact] Failed to extract contact:", err);
    return emptyContact;
  }
}
