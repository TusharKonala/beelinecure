import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { getEmailFrom } from "@/lib/email-from";

const demoRequestSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(255),
  clinicName: z.string().trim().min(1, "Clinic name is required").max(255),
  phone: z
    .string()
    .trim()
    .max(30, "Phone number is too long")
    .refine((v) => !v || v.length >= 7, "Phone number is too short"),
  email: z.string().email("Please enter a valid email address"),
  notes: z.string().trim().max(500, "Notes are too long").optional(),
});

const DEMO_INBOX = "hello@beelinecure.com";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = demoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.error("[demo-request] RESEND_API_KEY is not configured");
    return NextResponse.json(
      { error: "Email service is not configured. Please try again later." },
      { status: 503 },
    );
  }

  const { fullName, clinicName, phone, email, notes } = parsed.data;
  const submittedAt = new Date().toISOString();

  const textBody = [
    "New demo request",
    "",
    `Full name: ${fullName}`,
    `Clinic name: ${clinicName}`,
    `Phone: ${phone || "Not provided"}`,
    `Email: ${email}`,
    `Notes: ${notes || "Not provided"}`,
    "",
    `Submitted at: ${submittedAt}`,
  ].join("\n");

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from =
      getEmailFrom();

    const { error } = await resend.emails.send({
      from,
      to: DEMO_INBOX,
      replyTo: email,
      subject: `Demo request — ${clinicName}`,
      text: textBody,
    });

    if (error) {
      console.error("[demo-request] Failed to send email:", error);
      return NextResponse.json(
        { error: "Failed to send your request. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[demo-request] Failed to send email:", err);
    return NextResponse.json(
      { error: "Failed to send your request. Please try again." },
      { status: 500 },
    );
  }
}
