import { getServerSession } from "next-auth/next";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NotificationType, UserRole } from "@/generated/prisma/client";
import { Resend } from "resend";
import { formatDoctorStoredName } from "@/lib/doctor-name";
import { DOCTOR_SPECIALIZATIONS } from "@/lib/doctor-specializations";
import { currencyForTimezone } from "@/lib/currency";
import { getEmailFrom } from "@/lib/email-from";
import {
  DOCTOR_BIO_MAX_CHARS,
  charLimitErrorMessage,
} from "@/lib/text-char-limit";

const doctorCompleteSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number"),
  specialization: z.enum(
    DOCTOR_SPECIALIZATIONS as unknown as readonly [string, ...string[]],
    { message: "Please choose a valid specialization." },
  ),
  qualification: z.string().min(2).max(255),
  licenseNumber: z.string().min(3),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  bio: z
    .string()
    .max(
      DOCTOR_BIO_MAX_CHARS,
      charLimitErrorMessage("Bio", DOCTOR_BIO_MAX_CHARS),
    )
    .optional(),
  profilePhotoUrl: z.string().min(1).max(100_000),
  timezone: z.string().min(1).max(128),
});

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = doctorCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      role: true,
      profileComplete: true,
      doctor: { select: { id: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.role !== UserRole.DOCTOR) {
    return NextResponse.json(
      { error: "This account is not flagged as a doctor signup." },
      { status: 409 },
    );
  }
  if (user.profileComplete) {
    return NextResponse.json(
      { error: "Doctor profile already completed." },
      { status: 409 },
    );
  }
  if (user.doctor) {
    return NextResponse.json(
      { error: "Doctor profile already exists." },
      { status: 409 },
    );
  }

  const data = parsed.data;
  const emailLocal = user.email?.split("@")[0] || "Doctor";
  const storedName = formatDoctorStoredName(data.name, emailLocal);

  const doctorRow = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: storedName,
        profileComplete: true,
      },
    });
    return tx.doctor.create({
      data: {
        userId: user.id,
        name: storedName,
        phone: data.phone.trim(),
        specialization: data.specialization.trim(),
        qualification: data.qualification.trim(),
        licenseNumber: data.licenseNumber.trim(),
        yearsExperience: data.yearsExperience,
        bio: data.bio?.trim() || null,
        profilePhotoUrl: data.profilePhotoUrl.trim(),
        timezone: data.timezone.trim(),
        currency: currencyForTimezone(data.timezone.trim()),
      },
    });
  });

  const adminUsers = await prisma.user.findMany({
    where: { role: UserRole.ADMIN },
    select: { id: true, email: true },
  });

  const headersList = await headers();
  const origin =
    headersList.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";
  const doctorsUrl = `${origin.replace(/\/$/, "")}/admin/doctors`;

  const displayName = storedName.trim();
  const applicantEmail = user.email ?? "";

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
    console.error("[doctor-complete] Failed to notify admins:", err);
  }

  const adminEmails = adminUsers
    .map((a) => a.email?.trim())
    .filter((e): e is string => Boolean(e));

  if (adminEmails.length > 0 && process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: getEmailFrom(),
        to: adminEmails,
        subject: "New doctor registration pending approval",
        text: [
          `A new doctor, ${displayName}, has completed signup and is pending approval.`,
          applicantEmail ? `Email: ${applicantEmail}` : "",
          `Review and approve: ${doctorsUrl}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
    } catch (err) {
      console.error("[doctor-complete] Admin alert email failed:", err);
    }
  }

  return NextResponse.json(
    { ok: true, requiresApproval: true, doctorId: doctorRow.id },
    { status: 201 },
  );
}
