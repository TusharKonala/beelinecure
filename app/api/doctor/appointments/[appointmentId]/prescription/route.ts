import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import {
  AppointmentStatus,
  NotificationType,
  type Prisma,
  UserRole,
} from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { MedicineReminderEmailTemplate } from "@/components/medicine-reminder-email-template";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { createAppointmentNotificationForEmail } from "@/lib/notifications";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import {
  chatThreadUrlForRole,
  ensureChatConversationForAppointment,
  isChatLocked,
} from "@/lib/chat";
import { getEmailFrom } from "@/lib/email-from";
import { prescriptionReminderTsFromSavedAt } from "@/lib/reminder-time";
import {
  isKnownLocalMedicine,
  normalizeMedicineName,
} from "@/lib/medicine-catalog";
import {
  formatDateInPatientTz,
  formatTimeInPatientTz,
} from "@/lib/timezone-display";
import { Resend } from "resend";

type MedicinePayload = {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions: string;
};

const resend = new Resend(process.env.RESEND_API_KEY);

function sanitizeMedicines(input: unknown): MedicinePayload[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const medicines: MedicinePayload[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") return null;
    const candidate = row as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const dosage = typeof candidate.dosage === "string" ? candidate.dosage.trim() : "";
    const frequency =
      typeof candidate.frequency === "string" ? candidate.frequency.trim() : "";
    const instructions =
      typeof candidate.instructions === "string" ? candidate.instructions.trim() : "";
    const durationRaw = candidate.durationDays;
    const durationDays =
      typeof durationRaw === "number" ? durationRaw : Number(durationRaw);
    if (
      !name ||
      !dosage ||
      !frequency ||
      !Number.isInteger(durationDays) ||
      durationDays <= 0
    ) {
      return null;
    }
    medicines.push({
      name,
      dosage,
      frequency,
      durationDays,
      instructions,
    });
  }
  return medicines;
}

async function getDoctorFromSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== UserRole.DOCTOR) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const doctor = await prisma.doctor.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!doctor) {
    return { error: NextResponse.json({ error: "Doctor profile not found" }, { status: 404 }) };
  }
  return { doctor, userId: session.user.id };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ appointmentId: string }> },
) {
  const doctorResult = await getDoctorFromSession();
  if ("error" in doctorResult) return doctorResult.error;

  const { appointmentId } = await context.params;
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctorResult.doctor.id,
    },
    select: {
      id: true,
      patientName: true,
      date: true,
      time: true,
      timezone: true,
      status: true,
      prescription: {
        select: {
          medicines: true,
          generalNotes: true,
        },
      },
    },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  return NextResponse.json({
    appointment: {
      id: appointment.id,
      patientName: appointment.patientName,
      date: appointment.date.toISOString().slice(0, 10),
      time: appointment.time,
      timezone: appointment.timezone,
      status: appointment.status,
    },
    prescription: appointment.prescription
      ? {
          medicines: appointment.prescription.medicines,
          generalNotes: appointment.prescription.generalNotes,
        }
      : null,
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ appointmentId: string }> },
) {
  const doctorResult = await getDoctorFromSession();
  if ("error" in doctorResult) return doctorResult.error;

  const { appointmentId } = await context.params;
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctorResult.doctor.id,
    },
    select: {
      id: true,
      status: true,
      email: true,
      patientName: true,
      date: true,
      time: true,
      timezone: true,
      patientTimezone: true,
      consultationType: true,
      doctor: {
        select: {
          name: true,
        },
      },
      prescription: {
        select: {
          appointmentId: true,
        },
      },
    },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.status === AppointmentStatus.CANCELLED) {
    return NextResponse.json({ error: "Cancelled appointment cannot be prescribed" }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        medicines?: unknown;
        generalNotes?: unknown;
      }
    | null;

  const medicines = sanitizeMedicines(body?.medicines);
  if (!medicines) {
    return NextResponse.json(
      { error: "Invalid medicines. Provide at least one valid medicine entry." },
      { status: 400 },
    );
  }

  const generalNotes =
    typeof body?.generalNotes === "string" ? body.generalNotes.trim() : "";
  const notificationKind = appointment.prescription ? "UPDATED" : "READY";
  const customMedicineCandidates = new Map<string, string>();
  for (const medicine of medicines) {
    const cleanedName = medicine.name.trim().replace(/\s+/g, " ");
    if (!cleanedName || isKnownLocalMedicine(cleanedName)) continue;
    const key = normalizeMedicineName(cleanedName);
    if (!customMedicineCandidates.has(key)) {
      customMedicineCandidates.set(key, cleanedName);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [normalizedName, displayName] of customMedicineCandidates) {
      const existing = await tx.customMedicine.findFirst({
        where: {
          createdByDoctorId: doctorResult.doctor.id,
          name: {
            equals: normalizedName,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });
      if (!existing) {
        await tx.customMedicine.create({
          data: {
            name: displayName,
            createdByDoctorId: doctorResult.doctor.id,
          },
        });
      }
    }

    await tx.prescription.upsert({
      where: { appointmentId: appointment.id },
      create: {
        appointmentId: appointment.id,
        medicines: medicines as Prisma.InputJsonValue,
        generalNotes: generalNotes || null,
      },
      update: {
        medicines: medicines as Prisma.InputJsonValue,
        generalNotes: generalNotes || null,
      },
    });

    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.COMPLETED,
      },
    });
  });

  const courseDays = Math.max(...medicines.map((medicine) => medicine.durationDays));
  try {
    const { halfwayTs, completedTs } = prescriptionReminderTsFromSavedAt(
      new Date(),
      appointment.patientTimezone,
      courseDays,
    );

    if (halfwayTs !== null) {
      await inngest.send({
        name: "prescription/reminder.scheduled",
        data: {
          appointmentId: appointment.id,
          reminderType: "HALFWAY",
        },
        ts: halfwayTs,
      });
    }
    if (completedTs !== null) {
      await inngest.send({
        name: "prescription/reminder.scheduled",
        data: {
          appointmentId: appointment.id,
          reminderType: "COMPLETED",
        },
        ts: completedTs,
      });
    }
  } catch (err) {
    console.error("[doctor-prescription] Failed to schedule reminders:", err);
  }

  let chatConv: { completedAt: Date; lockedAt: Date | null } | null = null;
  try {
    await ensureChatConversationForAppointment(appointment.id);
    chatConv = await prisma.chatConversation.findUnique({
      where: { appointmentId: appointment.id },
      select: { completedAt: true, lockedAt: true },
    });
  } catch (err) {
    console.error("[doctor-prescription] Failed to ensure chat conversation:", err);
  }

  try {
    const dateStr = appointment.date.toISOString().slice(0, 10);
    const doctorDisplayName = formatDoctorDisplayName(appointment.doctor.name);
    const subject =
      notificationKind === "READY"
        ? "Your prescription is ready"
        : "Your prescription has been updated";
    const heading =
      notificationKind === "READY" ? "Prescription Ready" : "Prescription Updated";
    const baseMessage =
      notificationKind === "READY"
        ? `Your prescription from ${doctorDisplayName} is now ready. You can review it online from your appointments.`
        : `Your prescription from ${doctorDisplayName} has been updated. Please review the latest version in your appointments.`;
    const chatActive =
      chatConv && !isChatLocked(chatConv.completedAt, chatConv.lockedAt);
    const chatUrl = chatActive
      ? chatThreadUrlForRole(UserRole.PATIENT, appointment.id)
      : null;
    const message = chatActive
      ? `${baseMessage} You can also message your doctor with any questions for up to 48 hours after your appointment.`
      : baseMessage;
    const notificationTitle =
      notificationKind === "READY" ? "Prescription ready" : "Prescription updated";
    const notificationMessage =
      notificationKind === "READY"
        ? `Your prescription from ${doctorDisplayName} is ready for your appointment on ${formatDateInPatientTz(
            dateStr,
            appointment.time,
            appointment.timezone,
            appointment.patientTimezone,
          )} at ${formatTimeInPatientTz(
            dateStr,
            appointment.time,
            appointment.timezone,
            appointment.patientTimezone,
          )}.`
        : `Your prescription from ${doctorDisplayName} was updated for your appointment on ${formatDateInPatientTz(
            dateStr,
            appointment.time,
            appointment.timezone,
            appointment.patientTimezone,
          )} at ${formatTimeInPatientTz(
            dateStr,
            appointment.time,
            appointment.timezone,
            appointment.patientTimezone,
          )}.`;
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
      "http://localhost:3000";
    const viewPrescriptionUrl = `${origin}/patient/appointments/${encodeURIComponent(
      appointment.id,
    )}/prescription`;

    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: appointment.email,
      subject,
      react: MedicineReminderEmailTemplate({
        heading,
        message,
        doctorName: appointment.doctor.name,
        patientName: appointment.patientName,
        primaryActionLabel: "View prescription",
        primaryActionUrl: viewPrescriptionUrl,
        secondaryActionLabel: chatUrl ? "Message your doctor" : undefined,
        secondaryActionUrl: chatUrl ?? undefined,
      }),
    });
    if (error) {
      console.error("[doctor-prescription] Prescription email failed:", error);
    }

    await createAppointmentNotificationForEmail({
      patientEmail: appointment.email,
      type: NotificationType.APPOINTMENT_REMINDER,
      title: notificationTitle,
      message: notificationMessage,
      actorUserId: doctorResult.userId,
    });
  } catch (err) {
    console.error("[doctor-prescription] Failed direct patient notification delivery:", err);
  }

  return NextResponse.json({ ok: true });
}
