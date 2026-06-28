/**
 * One-off: enqueue `appointment/started.scheduled` for all future CONFIRMED
 * appointments so doctor dashboards refresh at slot start after deploying
 * realtime updates.
 *
 * Run before production deploy of doctor appointments Pusher/Inngest changes.
 *
 * Usage: `npx tsx scripts/backfill-appointment-started-events.ts`
 * (with DATABASE_URL and Inngest env in .env)
 */
import "dotenv/config";
import { AppointmentStatus } from "../generated/prisma/client.js";
import { scheduleAppointmentStartedEvent } from "../lib/appointment-started-schedule";
import { appointmentStartAtMs } from "../lib/reminder-time";
import { prisma } from "../lib/db";

async function main() {
  const appointments = await prisma.appointment.findMany({
    where: { status: AppointmentStatus.CONFIRMED },
    select: {
      id: true,
      date: true,
      time: true,
      timezone: true,
    },
  });

  let scheduled = 0;
  let skipped = 0;

  for (const appointment of appointments) {
    const dateParam = appointment.date.toISOString().slice(0, 10);
    const ts = appointmentStartAtMs(
      dateParam,
      appointment.time,
      appointment.timezone,
    );
    if (ts === null) {
      skipped += 1;
      continue;
    }

    await scheduleAppointmentStartedEvent({
      appointmentId: appointment.id,
      dateParam,
      time: appointment.time,
      timezone: appointment.timezone,
    });
    scheduled += 1;
    console.log(`scheduled → ${appointment.id} (${dateParam} ${appointment.time})`);
  }

  console.log(
    `Done. Scheduled ${scheduled} started event(s); skipped ${skipped} past or invalid.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
