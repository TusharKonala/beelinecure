import { NextResponse } from "next/server";
import { z } from "zod";
import { extractContactFromResumeText } from "@/lib/careers-resume-contact-extract";
import {
  MAX_RESUME_CHARS,
  MIN_RESUME_CHARS,
} from "@/lib/extract-pdf-text";

const extractContactBodySchema = z.object({
  resumeText: z
    .string()
    .min(
      MIN_RESUME_CHARS,
      `Resume text must be at least ${MIN_RESUME_CHARS} characters`,
    )
    .max(MAX_RESUME_CHARS, "Resume text is too long"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = extractContactBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    const contact = await extractContactFromResumeText(parsed.data.resumeText);
    return NextResponse.json(contact);
  } catch (err) {
    console.error("[careers/extract-contact] Unexpected error:", err);
    return NextResponse.json(
      { error: "Could not extract contact details" },
      { status: 500 },
    );
  }
}
