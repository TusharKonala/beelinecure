"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDateInDoctorTz,
  formatTimeInDoctorTz,
} from "@/lib/timezone-display";

type OverviewPayload = {
  stats: {
    todayAppointments: number;
    totalUniquePatients: number;
    pendingPrescriptions: number;
  };
  upcomingAppointments: Array<{
    id: string;
    patientName: string;
    date: string;
    time: string;
    timezone: string;
    durationMinutes: number;
  }>;
  recentPatients: Array<{
    patientName: string;
    email: string;
    phone: string;
    lastAppointmentDate: string;
    lastAppointmentTime: string;
    lastAppointmentTimezone: string;
  }>;
};

const statCardClass =
  "rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm md:p-5";
const listCardClass =
  "rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm";

function OverviewListItemSkeleton() {
  return (
    <article className={listCardClass}>
      <Skeleton className="h-4 w-36 bg-[#e5e5e5]" />
      <Skeleton className="mt-2 h-4 w-52 bg-[#e5e5e5]" />
      <Skeleton className="mt-2 h-3 w-28 bg-[#e5e5e5]" />
    </article>
  );
}

export function DoctorOverviewClient() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadOverview() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/doctor/overview", {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!isMounted) return;
          setError("Failed to load overview.");
          return;
        }
        const payload = (await response.json()) as OverviewPayload;
        if (!isMounted) return;
        setData(payload);
      } catch {
        if (!isMounted) return;
        setError("Failed to load overview.");
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    }

    void loadOverview();
    return () => {
      isMounted = false;
    };
  }, []);

  const stats = data?.stats;

  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-2">
            <h1
              style={{
                WebkitTextStroke: "0.08px #333333",
                WebkitTextFillColor: "#333333",
              }}
              className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl"
            >
              Overview
            </h1>
            <p className="font-montserrat text-sm text-[#5E5E5E]">
              Track your appointments, patients, and prescription workload in
              one place.
            </p>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
              <p className="font-montserrat text-sm text-[#5E5E5E]">{error}</p>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-4 min-[510px]:grid-cols-3">
            <article className={statCardClass}>
              <p className="text-center font-montserrat text-xs font-medium uppercase tracking-wide text-[#5E5E5E] min-[510px]:text-left">
                Today&apos;s Appointments
              </p>
              <p className="mt-2 text-center font-montaga text-3xl text-[#333333] min-[510px]:text-left">
                {isLoading || !stats ? (
                  <Skeleton className="mx-auto h-9 w-12 bg-[#e5e5e5] min-[510px]:mx-0" />
                ) : (
                  stats.todayAppointments
                )}
              </p>
            </article>
            <article className={statCardClass}>
              <p className="text-center font-montserrat text-xs font-medium uppercase tracking-wide text-[#5E5E5E] min-[510px]:text-left">
                Total Patients
              </p>
              <p className="mt-2 text-center font-montaga text-3xl text-[#333333] min-[510px]:text-left">
                {isLoading || !stats ? (
                  <Skeleton className="mx-auto h-9 w-12 bg-[#e5e5e5] min-[510px]:mx-0" />
                ) : (
                  stats.totalUniquePatients
                )}
              </p>
            </article>
            <article className={statCardClass}>
              <p className="text-center font-montserrat text-xs font-medium uppercase tracking-wide text-[#5E5E5E] min-[510px]:text-left">
                Pending Prescriptions
              </p>
              <p className="mt-2 text-center font-montaga text-3xl text-[#333333] min-[510px]:text-left">
                {isLoading || !stats ? (
                  <Skeleton className="mx-auto h-9 w-12 bg-[#e5e5e5] min-[510px]:mx-0" />
                ) : (
                  stats.pendingPrescriptions
                )}
              </p>
            </article>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 md:p-5">
              <h2 className="font-montaga text-xl text-[#333333]">
                Upcoming Appointments
              </h2>
              <div className="mt-4 space-y-3">
                {isLoading ? (
                  <>
                    <OverviewListItemSkeleton />
                    <OverviewListItemSkeleton />
                  </>
                ) : !data || data.upcomingAppointments.length === 0 ? (
                  <p className="font-montserrat text-sm text-[#5E5E5E]">
                    No upcoming appointments right now.
                  </p>
                ) : (
                  data.upcomingAppointments.map((appointment) => (
                    <article key={appointment.id} className={listCardClass}>
                      <p className="font-montserrat text-sm font-semibold text-[#333333]">
                        {appointment.patientName}
                      </p>
                      <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
                        {formatDateInDoctorTz(
                          appointment.date,
                          appointment.time,
                          appointment.timezone,
                        )}{" "}
                        at{" "}
                        {formatTimeInDoctorTz(
                          appointment.date,
                          appointment.time,
                          appointment.timezone,
                        )}
                      </p>
                      <p className="mt-1 font-montserrat text-xs text-[#5E5E5E]">
                        Duration: {appointment.durationMinutes} min
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 md:p-5">
              <h2 className="font-montaga text-xl text-[#333333]">
                Recent Patients
              </h2>
              <div className="mt-4 space-y-3">
                {isLoading ? (
                  <>
                    <OverviewListItemSkeleton />
                    <OverviewListItemSkeleton />
                  </>
                ) : !data || data.recentPatients.length === 0 ? (
                  <p className="font-montserrat text-sm text-[#5E5E5E]">
                    No recent patients found.
                  </p>
                ) : (
                  data.recentPatients.map((patient) => (
                    <article key={patient.email} className={listCardClass}>
                      <p className="font-montserrat text-sm font-semibold text-[#333333]">
                        {patient.patientName}
                      </p>
                      <p className="mt-1 break-all font-montserrat text-sm text-[#5E5E5E]">
                        {patient.email}
                      </p>
                      <p className="mt-1 font-montserrat text-xs text-[#5E5E5E]">
                        Last visit:{" "}
                        {formatDateInDoctorTz(
                          patient.lastAppointmentDate,
                          patient.lastAppointmentTime,
                          patient.lastAppointmentTimezone,
                        )}{" "}
                        at{" "}
                        {formatTimeInDoctorTz(
                          patient.lastAppointmentDate,
                          patient.lastAppointmentTime,
                          patient.lastAppointmentTimezone,
                        )}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="mt-8 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 md:p-5">
            <h2 className="font-montaga text-xl text-[#333333]">
              Quick Actions
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Button
                asChild
                className="w-full bg-[#2555F3] hover:bg-[#2555F3]/90"
              >
                <Link href="/doctor/my-schedule">Schedule</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
              >
                <Link href="/doctor/prescriptions">Prescriptions</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
              >
                <Link href="/doctor/settings">Settings</Link>
              </Button>
            </div>
          </section>

          {!isLoading && !error && !data ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
              <p className="font-montserrat text-sm text-[#5E5E5E]">
                Overview data is currently unavailable.
              </p>
            </div>
          ) : null}

          <div className="mt-6">
            <Button
              asChild
              variant="link"
              className="h-auto px-0 font-montserrat text-[#2555F3]"
            >
              <Link href="/doctor/appointments">View all appointments</Link>
            </Button>
          </div>
        </section>
      </Container>
    </div>
  );
}
