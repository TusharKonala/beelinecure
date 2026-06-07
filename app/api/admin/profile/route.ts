import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { UserRole } from "@/generated/prisma/client";
import { AdminEmailChangeTemplate } from "@/components/admin-email-change-template";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmailFrom } from "@/lib/email-from";

const updateSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.email(),
});

function resolveOrigin(headersList: Headers) {
  return (
    headersList.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000"
  );
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      pendingEmail: true,
      password: true,
      googleCalendarRefreshToken: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    name: user.name,
    email: user.email,
    pendingEmail: user.pendingEmail,
    hasPassword: Boolean(user.password),
    googleCalendarConnected: Boolean(user.googleCalendarRefreshToken),
  });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const name = parsed.data.name.trim();
  const nextEmail = parsed.data.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      pendingEmail: true,
      password: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const primaryEmail = user.email.trim().toLowerCase();
  const emailMatchesPrimary = nextEmail === primaryEmail;

  if (emailMatchesPrimary) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        pendingEmail: null,
        emailChangeTokenHash: null,
        emailChangeTokenExpiresAt: null,
      },
      select: {
        name: true,
        email: true,
        pendingEmail: true,
        password: true,
      },
    });
    return NextResponse.json({
      name: updated.name,
      email: updated.email,
      pendingEmail: updated.pendingEmail,
      hasPassword: Boolean(updated.password),
    });
  }

  const taken = await prisma.user.findFirst({
    where: {
      email: nextEmail,
      NOT: { id: user.id },
    },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json(
      { error: "That email is already in use." },
      { status: 409 },
    );
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("[admin/profile] RESEND_API_KEY is not configured");
    return NextResponse.json(
      { error: "Email service is not configured." },
      { status: 503 },
    );
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      pendingEmail: nextEmail,
      emailChangeTokenHash: tokenHash,
      emailChangeTokenExpiresAt: expiresAt,
    },
  });

  const headersList = await headers();
  const origin = resolveOrigin(headersList);
  const confirmUrl = `${origin}/auth/confirm-email-change?token=${encodeURIComponent(
    rawToken,
  )}`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = getEmailFrom();

    const { error } = await resend.emails.send({
      from,
      to: nextEmail,
      subject: "Confirm your new BeelineCure admin email",
      react: AdminEmailChangeTemplate({
        recipientName: name || "there",
        confirmUrl,
        currentEmail: user.email,
      }),
    });

    if (error) {
      console.error(
        "[admin/profile] Failed to send confirmation email:",
        error,
      );
      await prisma.user.update({
        where: { id: user.id },
        data: {
          pendingEmail: null,
          emailChangeTokenHash: null,
          emailChangeTokenExpiresAt: null,
        },
      });
      return NextResponse.json(
        { error: "Could not send confirmation email. Try again later." },
        { status: 503 },
      );
    }
  } catch (err) {
    console.error("[admin/profile] Failed to send confirmation email:", err);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        pendingEmail: null,
        emailChangeTokenHash: null,
        emailChangeTokenExpiresAt: null,
      },
    });
    return NextResponse.json(
      { error: "Could not send confirmation email. Try again later." },
      { status: 503 },
    );
  }

  const refreshed = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      email: true,
      pendingEmail: true,
      password: true,
    },
  });

  return NextResponse.json({
    name: refreshed?.name ?? name,
    email: refreshed?.email ?? user.email,
    pendingEmail: refreshed?.pendingEmail ?? nextEmail,
    hasPassword: Boolean(refreshed?.password ?? user.password),
  });
}
