import { getServerSession } from "next-auth/next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, CalendarClock, HeartPulse } from "lucide-react";
import { AppointmentStatus } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Container } from "@/components/layout/Container";
import { computeAgeYears, computeBmi } from "@/lib/health-profile-metrics";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import {
  formatDateInPatientTz,
  formatTimeInPatientTz,
  isDoctorTimeInPast,
} from "@/lib/timezone-display";

function truncate(s: string | null, max: number): string {
  if (!s?.trim()) return "";
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function formatNotificationWhen(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

/** Shared snapshot card icon treatment — matches across health, appointments, notifications */
const SNAPSHOT_ICON_WRAP =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#e5e5e5] bg-gradient-to-br from-white to-[#f6f8fc] shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-[#2555F3]/[0.08]";
const SNAPSHOT_ICON = "size-[22px] shrink-0 text-[#2555F3]";

/** Appointments + notifications pair: equal-height columns, side-by-side from md up */
const SNAPSHOT_PAIR_GRID =
  "mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 md:items-stretch";
/** Outer shell — identical for both snapshot cards */
const SNAPSHOT_CARD =
  "flex h-full min-h-0 flex-col rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5 shadow-sm";
const SNAPSHOT_CARD_HEADER =
  "flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4";
const SNAPSHOT_CARD_TITLE_BLOCK = "flex min-w-0 flex-1 gap-3";
const SNAPSHOT_VIEW_ALL =
  "shrink-0 self-start font-montserrat text-sm font-medium text-[#2555F3] transition-colors hover:text-[#1e44c7] sm:self-auto";
/** Body: grows so both cards align; empty state uses same min height */
const SNAPSHOT_CARD_BODY = "mt-4 flex min-h-[148px] flex-1 flex-col";
const SNAPSHOT_EMPTY_INNER =
  "flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-[#e5e5e5] bg-white px-4 py-5 text-center";
const SNAPSHOT_LIST_ITEM =
  "rounded-lg border border-[#e5e5e5] bg-white px-4 py-3";

export default async function PatientOverviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/auth/signin?callbackUrl=/patient/overview");
  }

  const userId = session.user.id;
  const healthProfile = await prisma.healthProfile.findUnique({
    where: { userId },
  });

  const snapshotAge = healthProfile?.dateOfBirth
    ? computeAgeYears(healthProfile.dateOfBirth)
    : null;
  const snapshotBmi =
    healthProfile?.heightCm != null &&
    healthProfile?.weightKg != null &&
    healthProfile.heightCm > 0 &&
    healthProfile.weightKg > 0
      ? computeBmi(healthProfile.heightCm, healthProfile.weightKg)
      : null;

  const email = session.user.email;

  const appointmentCandidates = await prisma.appointment.findMany({
    where: {
      email,
      status: {
        in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
      },
    },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: 48,
    select: {
      id: true,
      date: true,
      time: true,
      timezone: true,
      doctor: { select: { name: true } },
    },
  });

  const upcomingAppointmentsSnapshot = appointmentCandidates
    .filter(
      (a) =>
        !isDoctorTimeInPast(
          a.date.toISOString().slice(0, 10),
          a.time,
          a.timezone,
        ),
    )
    .slice(0, 2);

  const notificationsSnapshot = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: {
      id: true,
      title: true,
      message: true,
      createdAt: true,
    },
  });

  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
          <h1
            style={{
              WebkitTextStroke: "0.08px #333333",
              WebkitTextFillColor: "#333333",
            }}
            className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl"
          >
            Overview
          </h1>
          <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
            Welcome back. Here&apos;s a quick snapshot of your account.
          </p>

          <div className={SNAPSHOT_PAIR_GRID}>
            <div className={SNAPSHOT_CARD}>
              <div className={SNAPSHOT_CARD_HEADER}>
                <div className={SNAPSHOT_CARD_TITLE_BLOCK}>
                  <div className={SNAPSHOT_ICON_WRAP}>
                    <CalendarClock
                      className={SNAPSHOT_ICON}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-montserrat text-sm font-semibold text-[#333333]">
                      Appointments snapshot
                    </h2>
                    <p className="mt-0.5 font-montserrat text-xs text-[#5E5E5E]">
                      Your next upcoming visits.
                    </p>
                  </div>
                </div>
                <Link
                  href="/patient/appointments"
                  className={SNAPSHOT_VIEW_ALL}
                >
                  View All
                </Link>
              </div>

              <div className={SNAPSHOT_CARD_BODY}>
                {upcomingAppointmentsSnapshot.length === 0 ? (
                  <div className={SNAPSHOT_EMPTY_INNER}>
                    <p className="font-montserrat text-sm font-medium text-[#333333]">
                      No upcoming appointments
                    </p>
                    <Link
                      href="/book-appointment"
                      className="mt-2 font-montserrat text-sm font-medium text-[#2555F3] underline underline-offset-2 transition-colors hover:text-[#1e44c7]"
                    >
                      Book appointment
                    </Link>
                  </div>
                ) : (
                  <ul className="flex flex-1 flex-col gap-3">
                    {upcomingAppointmentsSnapshot.map((a) => {
                      const dateStr = a.date.toISOString().slice(0, 10);
                      return (
                        <li key={a.id} className={SNAPSHOT_LIST_ITEM}>
                          <p className="wrap-break-word font-montserrat text-sm font-semibold text-[#333333]">
                            {formatDoctorDisplayName(a.doctor.name)}
                          </p>
                          <p className="mt-1 font-montserrat text-xs text-[#5E5E5E]">
                            {formatDateInPatientTz(dateStr, a.time, a.timezone)} ·{" "}
                            {formatTimeInPatientTz(dateStr, a.time, a.timezone)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className={SNAPSHOT_CARD}>
              <div className={SNAPSHOT_CARD_HEADER}>
                <div className={SNAPSHOT_CARD_TITLE_BLOCK}>
                  <div className={SNAPSHOT_ICON_WRAP}>
                    <BellRing
                      className={SNAPSHOT_ICON}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-montserrat text-sm font-semibold text-[#333333]">
                      Notifications snapshot
                    </h2>
                    <p className="mt-0.5 font-montserrat text-xs text-[#5E5E5E]">
                      Latest updates.
                    </p>
                  </div>
                </div>
                <Link
                  href="/patient/notifications"
                  className={SNAPSHOT_VIEW_ALL}
                >
                  View All
                </Link>
              </div>

              <div className={SNAPSHOT_CARD_BODY}>
                {notificationsSnapshot.length === 0 ? (
                  <div className={SNAPSHOT_EMPTY_INNER}>
                    <p className="font-montserrat text-sm font-medium text-[#333333]">
                      No notifications yet
                    </p>
                    <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
                      Appointment updates will appear here.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-1 flex-col gap-3">
                    {notificationsSnapshot.map((n) => (
                      <li key={n.id} className={SNAPSHOT_LIST_ITEM}>
                        <p className="wrap-break-word font-montserrat text-sm font-semibold text-[#333333]">
                          {n.title}
                        </p>
                        <p className="mt-1 wrap-break-word font-montserrat text-sm leading-relaxed text-[#5E5E5E]">
                          {truncate(n.message, 140)}
                        </p>
                        <p className="mt-2 font-montserrat text-xs text-[#9A9A9A]">
                          {formatNotificationWhen(n.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8">
            {!healthProfile ? (
              <div className="rounded-xl border border-dashed border-[#2555F3]/40 bg-[#f5f8ff] p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-3">
                    <div className={SNAPSHOT_ICON_WRAP}>
                      <HeartPulse
                        className={SNAPSHOT_ICON}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </div>
                    <div>
                      <p className="font-montserrat text-sm font-semibold text-[#333333]">
                        Complete your health profile
                      </p>
                      <p className="mt-1 max-w-xl font-montserrat text-sm text-[#5E5E5E]">
                        Add vitals, medical history, lifestyle, and emergency
                        contacts so your care team has the essentials on file.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/patient/health-profile"
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#2555F3] px-5 font-montserrat text-sm font-medium text-white transition-colors hover:bg-[#1e44c7]"
                  >
                    Add health profile
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className={SNAPSHOT_ICON_WRAP}>
                      <HeartPulse
                        className={SNAPSHOT_ICON}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-montserrat text-sm font-semibold text-[#333333]">
                        Health snapshot
                      </h2>
                      <p className="mt-0.5 font-montserrat text-xs text-[#5E5E5E]">
                        Quick vitals and key details.
                      </p>
                      <dl className="mt-3 space-y-2 font-montserrat text-sm text-[#333333]">
                        {(snapshotAge != null ||
                          healthProfile.gender?.trim() ||
                          snapshotBmi != null) && (
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-[#5E5E5E]">
                              Vitals
                            </dt>
                            <dd className="mt-0.5">
                              {[
                                snapshotAge != null ? `Age ${snapshotAge}` : null,
                                healthProfile.gender?.trim() || null,
                                snapshotBmi != null ? `BMI ${snapshotBmi}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-[#5E5E5E]">
                            Blood group
                          </dt>
                          <dd className="mt-0.5">
                            {healthProfile.bloodGroup?.trim() || "—"}
                          </dd>
                        </div>
                        {(healthProfile.allergies?.trim() ||
                          healthProfile.conditions?.trim() ||
                          healthProfile.currentMedications?.trim()) && (
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-[#5E5E5E]">
                              Medical
                            </dt>
                            <dd className="mt-0.5 whitespace-pre-wrap">
                              {[
                                healthProfile.allergies?.trim()
                                  ? `Allergies: ${truncate(healthProfile.allergies, 120)}`
                                  : null,
                                healthProfile.conditions?.trim()
                                  ? `Conditions: ${truncate(healthProfile.conditions, 120)}`
                                  : null,
                                healthProfile.currentMedications?.trim()
                                  ? `Meds: ${truncate(healthProfile.currentMedications, 120)}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join("\n")}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </div>
                  <Link
                    href="/patient/health-profile"
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-[#e5e5e5] bg-white px-4 font-montserrat text-sm font-medium text-[#2555F3] shadow-sm transition-colors hover:bg-[#f5f5f5]"
                  >
                    View full profile
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </Container>
    </div>
  );
}
