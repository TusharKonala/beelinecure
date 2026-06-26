import { EmailTemplate } from "@/components/email-template";
import {
  AppointmentStatus,
  ConsultationType,
  NotificationType,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { updateMeetEventForOnlineAppointment } from "@/lib/google-calendar-meet";
import { inngest } from "@/inngest/client";
import { createAppointmentNotificationForEmail } from "@/lib/notifications";
import { buildEmailPriceLabels } from "@/lib/email-price-labels";
import { rescheduleConfirmationEmailMessage } from "@/lib/reschedule-policy-copy";
import type { RescheduleInitiator } from "@/lib/appointment-reschedule-eligibility";
import {
  clinicT120ReminderAtMs,
  onlineT15ReminderAtMs,
  reminderAtMsFromPatientLocal,
} from "@/lib/reminder-time";
import {
  formatDateInPatientTz,
  formatTimeInPatientTz,
} from "@/lib/timezone-display";
import { Resend } from "resend";
import { getEmailFrom } from "@/lib/email-from";
import { triggerSlotUpdated } from "@/lib/pusher-server";

const resend = new Resend(process.env.RESEND_API_KEY);

export type RescheduleAppointmentRow = {
  id: string;
  doctorId: string;
  email: string;
  patientName: string;
  consultationType: ConsultationType;
  timezone: string;
  patientTimezone: string;
  cancelToken: string | null;
  rescheduleToken: string | null;
  /** YYYY-MM-DD of the slot before reschedule */
  previousDateYmd: string;
  /** HH:mm of the slot before reschedule */
  previousTime: string;
};

/**
 * Moves an appointment to a new slot (same notification + calendar flow as patient reschedule).
 * Caller must validate auth / tokens and that the appointment is reschedulable.
 * `date` must be the UTC midnight-normalized date used by Prisma `@db.Date` (same as `parseDateOnly` in the API route).
 */
export async function reschedulePatientAppointment(input: {
  appointment: RescheduleAppointmentRow;
  /** YYYY-MM-DD for reminders and email copy */
  dateParam: string;
  /** Parsed calendar date for DB conflict + update */
  date: Date;
  time: string;
  patientTimezoneOverride?: string;
  requestOrigin: string;
  /**
   * User id who initiated the reschedule. Stored on the resulting
   * notification so the toaster can suppress live toasts when the recipient
   * is also the actor.
   */
  actorUserId?: string | null;
  initiatedBy?: RescheduleInitiator;
}): Promise<{ ok: true } | { ok: false; code: "slot_unavailable" }> {
  const {
    appointment,
    dateParam,
    date,
    time,
    patientTimezoneOverride,
    requestOrigin,
    actorUserId,
    initiatedBy = "patient",
  } = input;

  const conflict = await prisma.appointment.findFirst({
    where: {
      doctorId: appointment.doctorId,
      date,
      time,
      status: { not: AppointmentStatus.CANCELLED },
      id: { not: appointment.id },
    },
  });

  if (conflict) {
    return { ok: false, code: "slot_unavailable" };
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      date,
      time,
      ...(patientTimezoneOverride
        ? { patientTimezone: patientTimezoneOverride }
        : {}),
    },
  });

  await triggerSlotUpdated(appointment.doctorId, {
    date: appointment.previousDateYmd,
    time: appointment.previousTime,
  });
  await triggerSlotUpdated(appointment.doctorId, {
    date: dateParam,
    time,
  });

  if (updatedAppointment.consultationType === ConsultationType.ONLINE) {
    await updateMeetEventForOnlineAppointment(updatedAppointment.id);
  }

  try {
    await inngest.send({
      name: "appointment/reminder.cancelled",
      data: {
        appointmentId: updatedAppointment.id,
      },
    });
    if (updatedAppointment.consultationType === ConsultationType.ONLINE) {
      await inngest.send({
        name: "appointment/online-reminder-t15.cancelled",
        data: {
          appointmentId: updatedAppointment.id,
        },
      });
    }
    if (updatedAppointment.consultationType === ConsultationType.CLINIC) {
      await inngest.send({
        name: "appointment/clinic-reminder-t120.cancelled",
        data: {
          appointmentId: updatedAppointment.id,
        },
      });
    }

    const reminderAtMs = reminderAtMsFromPatientLocal(
      dateParam,
      time,
      appointment.timezone,
    );

    if (reminderAtMs !== null) {
      await inngest.send({
        name: "appointment/reminder.scheduled",
        data: {
          appointmentId: updatedAppointment.id,
        },
        ts: reminderAtMs,
      });
    }

    if (updatedAppointment.consultationType === ConsultationType.ONLINE) {
      const t15Ms = onlineT15ReminderAtMs(
        dateParam,
        time,
        appointment.timezone,
      );
      if (t15Ms !== null) {
        await inngest.send({
          name: "appointment/online-reminder-t15.scheduled",
          data: { appointmentId: updatedAppointment.id },
          ts: t15Ms,
        });
      }
    }
    if (updatedAppointment.consultationType === ConsultationType.CLINIC) {
      const t120Ms = clinicT120ReminderAtMs(
        dateParam,
        time,
        appointment.timezone,
      );
      if (t120Ms !== null) {
        await inngest.send({
          name: "appointment/clinic-reminder-t120.scheduled",
          data: { appointmentId: updatedAppointment.id },
          ts: t120Ms,
        });
      }
    }
  } catch (err) {
    console.error("[appointment-reschedule] Failed to re-schedule reminder:", err);
  }

  try {
    const doctor = await prisma.doctor.findUnique({
      where: { id: updatedAppointment.doctorId },
    });

    if (
      !doctor ||
      !updatedAppointment.email ||
      !updatedAppointment.cancelToken ||
      !updatedAppointment.rescheduleToken
    ) {
      console.error(
        "[appointment-reschedule] Missing doctor/email/tokens; skipping confirmation email.",
      );
    } else {
      const origin =
        requestOrigin ||
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
        "http://localhost:3000";

      const cancelUrl = `${origin}/cancel?appointmentId=${encodeURIComponent(
        updatedAppointment.id,
      )}&token=${encodeURIComponent(updatedAppointment.cancelToken)}`;
      const rescheduleUrl = `${origin}/reschedule?appointmentId=${encodeURIComponent(
        updatedAppointment.id,
      )}&token=${encodeURIComponent(updatedAppointment.rescheduleToken)}`;

      const latestMeet = await prisma.appointment.findUnique({
        where: { id: updatedAppointment.id },
        select: { googleMeetUrl: true },
      });

      const { priceLabel, approxLocalPriceLabel } = await buildEmailPriceLabels({
        priceCents: updatedAppointment.priceCentsAtBooking ?? null,
        baseCurrency: updatedAppointment.currencyAtBooking ?? null,
        patientTimezone: updatedAppointment.patientTimezone,
      });

      const { error } = await resend.emails.send({
        from: getEmailFrom(),
        to: updatedAppointment.email,
        subject: "Appointment Rescheduled",
        react: EmailTemplate({
          heading: "Appointment Rescheduled",
          message: rescheduleConfirmationEmailMessage(
            updatedAppointment.consultationType === ConsultationType.ONLINE
              ? "ONLINE"
              : "CLINIC",
            initiatedBy,
          ),
          doctorName: doctor.name,
          appointmentDate: formatDateInPatientTz(
            dateParam,
            time,
            updatedAppointment.timezone,
            updatedAppointment.patientTimezone,
          ),
          appointmentTime: formatTimeInPatientTz(
            dateParam,
            time,
            updatedAppointment.timezone,
            updatedAppointment.patientTimezone,
          ),
          patientName: updatedAppointment.patientName,
          consultationType: updatedAppointment.consultationType,
          cancelUrl,
          rescheduleUrl,
          meetLink: latestMeet?.googleMeetUrl ?? null,
          priceLabel,
          approxLocalPriceLabel,
          durationMinutes: updatedAppointment.durationMinutes,
        }),
      });

      if (error) {
        console.error("[appointment-reschedule] Confirmation email failed:", error);
      }
    }
  } catch (err) {
    console.error("[appointment-reschedule] Confirmation email failed:", err);
  }

  try {
    const formattedDate = formatDateInPatientTz(
      dateParam,
      time,
      updatedAppointment.timezone,
      updatedAppointment.patientTimezone,
    );
    const formattedTime = formatTimeInPatientTz(
      dateParam,
      time,
      updatedAppointment.timezone,
      updatedAppointment.patientTimezone,
    );
    const doctor = await prisma.doctor.findUnique({
      where: { id: updatedAppointment.doctorId },
      select: { name: true },
    });
    const doctorDisplayName = doctor?.name
      ? formatDoctorDisplayName(doctor.name)
      : null;
    const rescheduleNotifyMessage =
      initiatedBy === "admin"
        ? `Our team rescheduled your appointment${
            doctorDisplayName ? ` with ${doctorDisplayName}` : ""
          } to ${formattedDate} at ${formattedTime}.`
        : `Your appointment${
            doctorDisplayName ? ` with ${doctorDisplayName}` : ""
          } is now set for ${formattedDate} at ${formattedTime}.`;
    await createAppointmentNotificationForEmail({
      patientEmail: updatedAppointment.email,
      type: NotificationType.APPOINTMENT_RESCHEDULED,
      title: "Appointment rescheduled",
      message: rescheduleNotifyMessage,
      actorUserId: actorUserId ?? null,
    });
  } catch (err) {
    console.error("[appointment-reschedule] Failed to create notification:", err);
  }

  return { ok: true };
}
