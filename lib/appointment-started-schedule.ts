import { inngest } from "@/inngest/client";
import { appointmentStartAtMs } from "@/lib/reminder-time";

export async function scheduleAppointmentStartedEvent(input: {
  appointmentId: string;
  dateParam: string;
  time: string;
  timezone: string;
}): Promise<void> {
  const ts = appointmentStartAtMs(
    input.dateParam,
    input.time,
    input.timezone,
  );
  if (ts === null) return;

  await inngest.send({
    name: "appointment/started.scheduled",
    data: { appointmentId: input.appointmentId },
    ts,
  });
}

export async function cancelAppointmentStartedEvent(
  appointmentId: string,
): Promise<void> {
  await inngest.send({
    name: "appointment/started.cancelled",
    data: { appointmentId },
  });
}
