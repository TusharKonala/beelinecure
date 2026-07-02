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
import {
  cancelAppointmentStartedEvent,
  scheduleAppointmentStartedEvent,
} from "@/lib/appointment-started-schedule";
import {
  coerceAllowedSlotDurationMinutes,
  resolveSlotMetaForStart,
} from "@/lib/doctor-availability-slots";
import {
  acquireDoctorDateLock,
  SlotUnavailableError,
} from "@/lib/slot-lock";
import { assertSlotBookable } from "@/lib/slot-availability";
import { consumeSlotHold } from "@/lib/slot-hold-server";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { triggerAppointmentsChanged, triggerSlotUpdated } from "@/lib/pusher-server";

const resend = new Resend(process.env.RESEND_API_KEY);

/** Thrown when an appointment is no longer reschedulable at commit time (e.g. cancelled concurrently). */
export class AppointmentNotReschedulableError extends Error {
  constructor(public readonly code: "appointment_cancelled") {
    super("Appointment cannot be rescheduled");
    this.name = "AppointmentNotReschedulableError";
  }
}

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
  /** Doctor timezone the client displayed when the slot was picked. */
  expectedDoctorTimezone?: string;
  requestOrigin: string;
  /**
   * User id who initiated the reschedule. Stored on the resulting
   * notification so the toaster can suppress live toasts when the recipient
   * is also the actor.
   */
  actorUserId?: string | null;
  initiatedBy?: RescheduleInitiator;
  /** The rescheduler's own active SlotHold on the target slot, excluded from the bookable check and consumed on success. */
  holdId?: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      code:
        | "slot_unavailable"
        | "appointment_cancelled"
        | "doctor_timezone_changed";
    }
> {
  const {
    appointment,
    dateParam,
    date,
    time,
    patientTimezoneOverride,
    expectedDoctorTimezone,
    requestOrigin,
    actorUserId,
    initiatedBy = "patient",
    holdId,
  } = input;

  // Single read of the doctor, reused for slot duration and the timezone guard.
  const doctorForSlots = await prisma.doctor.findUnique({
    where: { id: appointment.doctorId },
    select: { slotDurationMinutes: true, timezone: true },
  });

  // Race guard: if the doctor changed timezone after the client rendered slots,
  // reject so the client can refetch. Whichever change lands first wins.
  if (
    expectedDoctorTimezone &&
    doctorForSlots &&
    doctorForSlots.timezone !== expectedDoctorTimezone
  ) {
    return { ok: false, code: "doctor_timezone_changed" };
  }

  const currentDoctorTimezone =
    doctorForSlots?.timezone ??
    expectedDoctorTimezone ??
    appointment.timezone;

  const fallbackDuration = coerceAllowedSlotDurationMinutes(
    doctorForSlots?.slotDurationMinutes ?? 30,
  );

  let updatedAppointment;
  try {
    updatedAppointment = await prisma.$transaction(async (tx) => {
      await acquireDoctorDateLock(tx, appointment.doctorId, dateParam);

      const current = await tx.appointment.findUnique({
        where: { id: appointment.id },
        select: { status: true },
      });
      if (
        !current ||
        current.status === AppointmentStatus.CANCELLED ||
        current.status === AppointmentStatus.COMPLETED
      ) {
        throw new AppointmentNotReschedulableError("appointment_cancelled");
      }

      const availabilityRows = await tx.doctorAvailability.findMany({
        where: { doctorId: appointment.doctorId, date },
      });
      if (
        resolveSlotMetaForStart(availabilityRows, time, fallbackDuration) ===
        null
      ) {
        throw new SlotUnavailableError();
      }

      // Reject slots already booked, held in another patient's checkout
      // (PENDING booking session), or reserved by another user's ACTIVE
      // SlotHold. Excludes this appointment and the rescheduler's own hold.
      // Runs under the per-day advisory lock acquired above; the Appointment
      // partial unique index is the hard backstop for the residual TOCTOU
      // window (see P2002 handling in the catch below).
      const bookable = await assertSlotBookable({
        doctorId: appointment.doctorId,
        dateYmd: dateParam,
        time,
        excludeAppointmentId: appointment.id,
        excludeSlotHoldId: holdId,
      });
      if (!bookable.ok) {
        throw new SlotUnavailableError();
      }

      const { count } = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          status: {
            in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
          },
        },
        data: {
          date,
          time,
          timezone: currentDoctorTimezone,
          ...(patientTimezoneOverride
            ? { patientTimezone: patientTimezoneOverride }
            : {}),
        },
      });
      if (count !== 1) {
        throw new AppointmentNotReschedulableError("appointment_cancelled");
      }

      const updated = await tx.appointment.findUnique({
        where: { id: appointment.id },
      });
      if (!updated) {
        throw new AppointmentNotReschedulableError("appointment_cancelled");
      }
      return updated;
    });
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      return { ok: false, code: "slot_unavailable" };
    }
    // The move is an updateMany onto the new slot, covered by the Appointment
    // partial unique index (one non-cancelled row per doctor/date/time). A
    // concurrent write that landed in the TOCTOU window surfaces as P2002 here.
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, code: "slot_unavailable" };
    }
    if (err instanceof AppointmentNotReschedulableError) {
      return { ok: false, code: err.code };
    }
    throw err;
  }

  // Consume the rescheduler's own hold on the new slot so it doesn't linger.
  // Best-effort: on failure the hold self-expires at its TTL and the now-booked
  // appointment blocks the slot regardless, so a stale hold is harmless.
  if (holdId) {
    try {
      await consumeSlotHold({
        holdId,
        doctorId: appointment.doctorId,
        dateYmd: dateParam,
        time,
      });
    } catch (err) {
      console.error(
        "[appointment-reschedule] Failed to consume slot hold:",
        err,
      );
    }
  }

  await triggerSlotUpdated(appointment.doctorId, {
    date: appointment.previousDateYmd,
    time: appointment.previousTime,
  });
  await triggerSlotUpdated(appointment.doctorId, {
    date: dateParam,
    time,
  });
  await triggerAppointmentsChanged(appointment.doctorId, {
    appointmentId: appointment.id,
    reason: "rescheduled",
  });

  if (updatedAppointment.consultationType === ConsultationType.ONLINE) {
    await updateMeetEventForOnlineAppointment(updatedAppointment.id);
  }

  try {
    await cancelAppointmentStartedEvent(updatedAppointment.id);
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
      updatedAppointment.timezone,
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
        updatedAppointment.timezone,
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
        updatedAppointment.timezone,
      );
      if (t120Ms !== null) {
        await inngest.send({
          name: "appointment/clinic-reminder-t120.scheduled",
          data: { appointmentId: updatedAppointment.id },
          ts: t120Ms,
        });
      }
    }

    await scheduleAppointmentStartedEvent({
      appointmentId: updatedAppointment.id,
      dateParam,
      time,
      timezone: updatedAppointment.timezone,
    });
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
