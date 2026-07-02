import { UserRole } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFutureCancellableAppointmentStats } from "@/lib/doctor-timezone-change";
import {
  consultationPriceCentsByDurationSchema,
  parsePriceMap,
} from "@/lib/doctor-pricing";
import { SUPPORTED_CURRENCIES, coerceSupportedCurrency } from "@/lib/currency";
import { DOCTOR_SPECIALIZATIONS } from "@/lib/doctor-specializations";
import {
  DOCTOR_BIO_MAX_CHARS,
  charLimitErrorMessage,
} from "@/lib/text-char-limit";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { triggerAvailabilityChanged } from "@/lib/pusher-server";

const updateDoctorSettingsSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().min(5, "Phone is required").max(32),
  specialization: z.enum(
    DOCTOR_SPECIALIZATIONS as unknown as readonly [string, ...string[]],
    { message: "Please choose a valid specialization." },
  ),
  qualification: z
    .string()
    .min(2, "Qualification is required")
    .max(255),
  licenseNumber: z.string().min(3).max(255),
  yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  bio: z
    .string()
    .max(
      DOCTOR_BIO_MAX_CHARS,
      charLimitErrorMessage("Bio", DOCTOR_BIO_MAX_CHARS),
    )
    .nullable()
    .optional(),
  profilePhotoUrl: z.string().min(1).max(100_000),
  timezone: z.string().min(1).max(128),
  currency: z.enum(SUPPORTED_CURRENCIES),
  consultationPriceCentsByDuration: consultationPriceCentsByDurationSchema,
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.DOCTOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const doctor = await prisma.doctor.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      phone: true,
      specialization: true,
      qualification: true,
      licenseNumber: true,
      yearsExperience: true,
      bio: true,
      profilePhotoUrl: true,
      timezone: true,
      currency: true,
      consultationPriceCentsByDuration: true,
      googleCalendarRefreshToken: true,
    },
  });

  if (!doctor) {
    return NextResponse.json(
      { error: "Doctor profile not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    doctor: {
      id: doctor.id,
      name: doctor.name,
      phone: doctor.phone,
      specialization: doctor.specialization,
      qualification: doctor.qualification,
      licenseNumber: doctor.licenseNumber,
      yearsExperience: doctor.yearsExperience,
      bio: doctor.bio,
      profilePhotoUrl: doctor.profilePhotoUrl,
      timezone: doctor.timezone,
      currency: coerceSupportedCurrency(doctor.currency),
      consultationPriceCentsByDuration: parsePriceMap(
        doctor.consultationPriceCentsByDuration,
      ),
    },
    googleCalendarConnected: Boolean(doctor.googleCalendarRefreshToken),
  });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.DOCTOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = updateDoctorSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const doctor = await prisma.doctor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, timezone: true },
  });
  if (!doctor) {
    return NextResponse.json(
      { error: "Doctor profile not found" },
      { status: 404 },
    );
  }

  const oldTimezone = doctor.timezone.trim();
  const newTimezone = parsed.data.timezone.trim();
  const timezoneChanged = oldTimezone !== newTimezone;

  const data = parsed.data;
  const phoneRaw = data.phone.trim();
  if (phoneRaw.length < 5) {
    return NextResponse.json(
      { error: "Phone must be at least 5 characters." },
      { status: 400 },
    );
  }
  const qualification = data.qualification.trim();
  if (!qualification) {
    return NextResponse.json(
      { error: "Qualification is required." },
      { status: 400 },
    );
  }
  const updated = await prisma.doctor.update({
    where: { id: doctor.id },
    data: {
      name: data.name.trim(),
      phone: phoneRaw,
      specialization: data.specialization.trim(),
      qualification,
      licenseNumber: data.licenseNumber.trim(),
      yearsExperience: data.yearsExperience ?? null,
      bio: data.bio?.trim() || null,
      profilePhotoUrl: data.profilePhotoUrl.trim(),
      timezone: data.timezone.trim(),
      currency: data.currency,
      consultationPriceCentsByDuration: data.consultationPriceCentsByDuration,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      specialization: true,
      qualification: true,
      licenseNumber: true,
      yearsExperience: true,
      bio: true,
      profilePhotoUrl: true,
      timezone: true,
      currency: true,
      consultationPriceCentsByDuration: true,
    },
  });

  if (timezoneChanged) {
    const stats = await getFutureCancellableAppointmentStats(doctor.id);
    if (stats.appointmentIds.length > 0) {
      try {
        await inngest.send({
          name: "doctor/timezone.cancel-appointments",
          data: {
            doctorId: doctor.id,
            appointmentIds: stats.appointmentIds,
            requestOrigin: new URL(request.url).origin,
            actorUserId: session.user.id,
            oldTimezone,
            newTimezone,
          },
        });
      } catch (err) {
        console.error(
          "[doctor/settings] Failed to queue timezone cancellations:",
          err,
        );
        return NextResponse.json(
          {
            error:
              "Your timezone was saved but appointment cancellations could not be started. Please try saving again or contact support.",
          },
          { status: 503 },
        );
      }
    }

    await triggerAvailabilityChanged(doctor.id, {
      dates: [],
      oldTimezone,
      newTimezone,
    });

    try {
      await inngest.send({
        name: "doctor/timezone.sweep-stale-appointments",
        data: { doctorId: doctor.id, oldTimezone, newTimezone },
        ts: Date.now() + 30 * 60 * 1000,
      });
    } catch (err) {
      console.error(
        "[doctor/settings] Failed to schedule stale timezone sweep:",
        err,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    doctor: {
      ...updated,
      currency: coerceSupportedCurrency(updated.currency),
      consultationPriceCentsByDuration: parsePriceMap(
        updated.consultationPriceCentsByDuration,
      ),
    },
  });
}
