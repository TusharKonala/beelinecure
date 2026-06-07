import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { getEmailFrom } from "@/lib/email-from";
import { PasswordResetTemplate } from "@/components/password-reset-template";

const forgotPasswordSchema = z.object({
  email: z.email(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();

  // Always return a generic success response to prevent account enumeration.
  const genericSuccess = NextResponse.json({ ok: true });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, password: true },
  });

  if (!user) return genericSuccess;

  if (!process.env.RESEND_API_KEY) {
    console.error("[forgot-password] RESEND_API_KEY is not configured");
    return genericSuccess;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: expiresAt,
    },
  });

  const headersList = await headers();
  const origin =
    headersList.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";

  const isSetPasswordFlow = !user.password;
  const resetUrl = `${origin}/auth/reset-password?token=${encodeURIComponent(
    rawToken,
  )}&mode=${isSetPasswordFlow ? "set" : "reset"}`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = getEmailFrom();

    const { error } = await resend.emails.send({
      from,
      to: user.email,
      subject: isSetPasswordFlow ? "Set your password" : "Reset your password",
      react: PasswordResetTemplate({
        recipientName: user.name ?? "there",
        resetUrl,
        mode: isSetPasswordFlow ? "set" : "reset",
      }),
    });

    if (error) {
      console.error("[forgot-password] Failed to send reset email:", error);
    }
  } catch (err) {
    console.error("[forgot-password] Failed to send reset email:", err);
  }

  return genericSuccess;
}
