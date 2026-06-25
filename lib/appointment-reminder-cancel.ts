import { ConsultationType } from "@/generated/prisma/client";
import { inngest } from "@/inngest/client";
import {
  clinicT120ReminderAtMs,
  onlineT15ReminderAtMs,
  reminderAtMsFromPatientLocal,
} from "@/lib/reminder-time";

export async function cancelPendingAppointmentReminders(input: {
  appointmentId: string;
  dateParam: string;
  time: string;
  timezone: string;
  consultationType: ConsultationType;
}) {
  const { appointmentId, dateParam, time, timezone, consultationType } = input;

  if (reminderAtMsFromPatientLocal(dateParam, time, timezone) !== null) {
    await inngest.send({
      name: "appointment/reminder.cancelled",
      data: { appointmentId },
    });
  }

  if (consultationType === ConsultationType.ONLINE) {
    if (onlineT15ReminderAtMs(dateParam, time, timezone) !== null) {
      await inngest.send({
        name: "appointment/online-reminder-t15.cancelled",
        data: { appointmentId },
      });
    }
  }

  if (consultationType === ConsultationType.CLINIC) {
    if (clinicT120ReminderAtMs(dateParam, time, timezone) !== null) {
      await inngest.send({
        name: "appointment/clinic-reminder-t120.cancelled",
        data: { appointmentId },
      });
    }
  }
}
