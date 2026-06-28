import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { getEmailFrom } from "@/lib/email-from";
import { MagicLinkEmailTemplate } from "@/components/magic-link-email-template";
import { safeCallbackPath } from "@/lib/safe-callback-path";

const bodySchema = z.object({
  email: z.email(),
  /** Optional post-login path; must be same-origin relative path. */
  callbackUrl: z.string().optional(),
});

const MAGIC_LINK_TTL_MS = 1000 * 60 * 15; // 15 minutes
const RESEND_COOLDOWN_MS = 1000 * 60; // 1 minute per user

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const callbackPath = safeCallbackPath(parsed.data.callbackUrl);

  // Generic success — do not reveal whether the email exists.
  const genericOk = NextResponse.json({ ok: true });

  if (!process.env.RESEND_API_KEY) {
    console.error("[magic-link] RESEND_API_KEY is not configured");
    return genericOk;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      magicLinkLastSentAt: true,
    },
  });

  if (!user) return genericOk;

  const now = Date.now();
  if (
    user.magicLinkLastSentAt &&
    now - user.magicLinkLastSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    return genericOk;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(now + MAGIC_LINK_TTL_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      magicLinkTokenHash: tokenHash,
      magicLinkTokenExpiresAt: expiresAt,
      magicLinkLastSentAt: new Date(now),
    },
  });

  const headersList = await headers();
  const origin =
    headersList.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";

  const signInUrl = `${origin}/auth/magic-link?token=${encodeURIComponent(
    rawToken,
  )}&callbackUrl=${encodeURIComponent(callbackPath)}`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = getEmailFrom();

    const { error } = await resend.emails.send({
      from,
      to: user.email,
      subject: "Your sign-in link",
      react: MagicLinkEmailTemplate({
        recipientName: user.name ?? "there",
        signInUrl,
      }),
    });

    if (error) {
      console.error("[magic-link] Failed to send email:", error);
    }
  } catch (err) {
    console.error("[magic-link] Failed to send email:", err);
  }

  return genericOk;
}
