import { z } from "zod";
import {
  callAnthropicWithRetry,
  parseJsonFromModelText,
} from "@/lib/anthropic-message";

const isoCountryCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toUpperCase());

const contactResultSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  phoneCountry: z.string().nullable(),
});

export type ResumeContactFields = z.infer<typeof contactResultSchema>;

const emptyContact: ResumeContactFields = {
  name: null,
  email: null,
  phone: null,
  phoneCountry: null,
};

function normalizePhoneCountry(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = isoCountryCodeSchema.safeParse(value.trim());
  return parsed.success ? parsed.data : null;
}

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
            content: `Resume text:\n${resumeText}\n\nExtract the candidate's contact details from this resume. Infer phone country from address, location, dialing prefix, or any explicit country on the resume. Respond with only a JSON object with exactly these fields:\n- name: string or null (full name)\n- email: string or null\n- phone: string or null (E.164 when possible, e.g. +14155552671)\n- phoneCountry: string or null (ISO 3166-1 alpha-2 code for the phone, e.g. IN, US, GB)\nUse null for any field not found or uncertain.`,
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
      phoneCountry: normalizePhoneCountry(parsed.phoneCountry),
    };
  } catch (err) {
    console.error("[careers-contact] Failed to extract contact:", err);
    return emptyContact;
  }
}
