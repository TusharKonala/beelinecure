import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { NotificationType, UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { Resend } from "resend";
import { EmailVerificationTemplate } from "@/components/email-verification-template";
import { formatDoctorStoredName } from "@/lib/doctor-name";
import { DOCTOR_SPECIALIZATIONS } from "@/lib/doctor-specializations";
import { currencyForTimezone } from "@/lib/currency";
import { getEmailFrom } from "@/lib/email-from";

const doctorSignupSchema = z.object({
  phone: z
    .string()
    .min(8, "Phone number is too short")
    .max(20, "Phone number is too long")
    .regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number"),
  specialization: z.enum(
    DOCTOR_SPECIALIZATIONS as unknown as readonly [string, ...string[]],
    { message: "Please choose a valid specialization." },
  ),
  qualification: z
    .string()
    .min(2, "Qualification is required")
    .max(255, "Qualification is too long"),
  licenseNumber: z.string().min(3, "License number is required"),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  bio: z.string().max(3000).optional(),
  profilePhotoUrl: z
    .string()
    .min(1, "Doctor profile photo is required")
    .max(100_000, "Profile photo is too large"),
  timezone: z.string().min(1).max(128),
});

const registerSchema = z
  .object({
    name: z.string().min(1).max(255),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number")
      .optional(),
    address: z.string().max(500).optional(),
    email: z.string().email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    role: z.enum(["PATIENT", "DOCTOR"]).optional().default("PATIENT"),
    doctor: doctorSignupSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "DOCTOR" && !value.doctor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Doctor profile details are required",
        path: ["doctor"],
      });
    }
    if (!value.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Name is required",
        path: ["name"],
      });
    }
  });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { name, email, password, role, doctor: doctorSignup, phone, address } =
    parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const emailLocal = normalizedEmail.split("@")[0] || "Doctor";

  const resolvedUserName =
    role === "DOCTOR"
      ? formatDoctorStoredName(name, emailLocal)
      : name?.trim() || null;

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  const hashed = await bcrypt.hash(password, 12);

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email service not configured" },
      { status: 500 },
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const verificationToken = randomBytes(32).toString("hex");
  const verificationTokenHash = createHash("sha256")
    .update(verificationToken)
    .digest("hex");
  const verificationTokenExpiresAt = new Date(
    Date.now() + 1000 * 60 * 60 * 24,
  ); // 24 hours

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      password: hashed,
      name: resolvedUserName,
      role: role === "DOCTOR" ? UserRole.DOCTOR : UserRole.PATIENT,
      profileComplete: true,
      phone: role === "PATIENT" ? phone?.trim() || null : null,
      address: role === "PATIENT" ? address?.trim() || null : null,
      emailVerifiedAt: null,
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationTokenExpiresAt: verificationTokenExpiresAt,
      doctor:
        role === "DOCTOR" && doctorSignup
          ? {
              create: {
                name: formatDoctorStoredName(name, emailLocal),
                phone: doctorSignup.phone.trim(),
                specialization: doctorSignup.specialization.trim(),
                qualification: doctorSignup.qualification.trim(),
                licenseNumber: doctorSignup.licenseNumber.trim(),
                yearsExperience: doctorSignup.yearsExperience,
                bio: doctorSignup.bio?.trim() || null,
                profilePhotoUrl: doctorSignup.profilePhotoUrl.trim(),
                timezone: doctorSignup.timezone.trim(),
                currency: currencyForTimezone(doctorSignup.timezone.trim()),
              },
            }
          : undefined,
    },
  });

  const headersList = await headers();
  const origin =
    headersList.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";

  const verificationUrl = `${origin}/auth/verify-email?token=${encodeURIComponent(
    verificationToken,
  )}`;

  try {
    const from = getEmailFrom();

    const { error } = await resend.emails.send({
      from,
      to: normalizedEmail,
      subject: "Verify your email",
      react: EmailVerificationTemplate({
        recipientName: user.name ?? "there",
        verificationUrl,
      }),
    });

    if (error) {
      console.error("[register] Verification email failed:", error);
      await prisma.user.delete({ where: { id: user.id } });
      return NextResponse.json(
        { error: "Unable to send verification email" },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("[register] Verification email threw error:", err);
    await prisma.user.delete({ where: { id: user.id } });
    return NextResponse.json(
      { error: "Unable to send verification email" },
      { status: 500 },
    );
  }

  if (role === "DOCTOR") {
    const adminUsers = await prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true, email: true },
    });

    const doctorsUrl = `${origin.replace(/\/$/, "")}/admin/doctors`;
    const displayName = (resolvedUserName ?? user.name ?? "").trim();
    const applicantEmail = normalizedEmail;

    if (adminUsers.length > 0) {
      try {
        await prisma.notification.createMany({
          data: adminUsers.map((admin) => ({
            userId: admin.id,
            type: NotificationType.DOCTOR_PENDING_APPROVAL,
            title: "Doctor pending approval",
            message: `${displayName} (${applicantEmail}) submitted a profile and is awaiting approval.`,
          })),
        });
      } catch (err) {
        console.error("[register] Failed to notify admins:", err);
      }
    }

    const adminEmails = adminUsers
      .map((a) => a.email?.trim())
      .filter((e): e is string => Boolean(e));

    if (adminEmails.length > 0 && process.env.RESEND_API_KEY) {
      try {
        const adminFrom =
          getEmailFrom();
        await resend.emails.send({
          from: adminFrom,
          to: adminEmails,
          subject: "New doctor registration pending approval",
          text: [
            `A new doctor, ${displayName}, has completed signup and is pending approval.`,
            `Email: ${applicantEmail}`,
            `Review and approve: ${doctorsUrl}`,
          ].join("\n\n"),
        });
      } catch (err) {
        console.error("[register] Admin alert email failed:", err);
      }
    }
  }

  return NextResponse.json(
    { ok: true, role, requiresApproval: role === "DOCTOR" },
    { status: 201 },
  );
}
