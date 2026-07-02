"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MontagaCapitalN } from "@/components/ui/MontagaCapitalN";
import {
  formatTimeInPatientTz,
  formatDateInPatientTz,
  isDoctorTimeInPast,
} from "@/lib/timezone-display";
import { SELECT_CHEVRON } from "@/lib/select-styles";
import { LeaveReviewModal } from "./LeaveReviewModal";

type ConsultationType = "CLINIC" | "ONLINE";
type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export type PatientAppointmentItem = {
  id: string;
  doctorId: string;
  cancelToken: string | null;
  rescheduleToken: string | null;
  patientName: string;
  date: string; // ISO date-only (YYYY-MM-DD) in doctor's timezone
  time: string; // HH:mm in doctor's timezone
  timezone: string; // Doctor's IANA timezone
  durationMinutes: number;
  consultationType: ConsultationType;
  googleMeetUrl: string | null;
  prescription: { medicines: unknown; generalNotes: string | null } | null;
  review: { id: string; rating: number } | null;
  status: AppointmentStatus;
  doctor: {
    name: string;
    specialization?: string | null;
  };
};

type TabKey = "upcoming" | "completed" | "cancelled";
type DateFilterValue = "asc" | "desc" | "today" | "week" | "month";
type DoctorOption = { id: string; name: string };

function tabFromParam(raw: string | null): TabKey {
  if (raw === "completed") return "completed";
  if (raw === "cancelled") return "cancelled";
  return "upcoming";
}

function consultationLabel(type: ConsultationType) {
  return type === "ONLINE" ? "Online" : "Clinic";
}

function AppointmentCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
          <div className="mt-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28 rounded-xl" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
    </div>
  );
}

function badgeClass(kind: "consultation" | "status", value: string) {
  if (kind === "consultation") {
    return value === "Online"
      ? "border-[#2555F3]/30 bg-[#2555F3]/10 text-[#2555F3]"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800";
  }

  switch (value) {
    case "PENDING":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800";
    case "CONFIRMED":
      return "border-[#2555F3]/30 bg-[#2555F3]/10 text-[#2555F3]";
    case "COMPLETED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-800";
    case "CANCELLED":
      return "border-red-500/30 bg-red-500/10 text-red-800";
    default:
      return "border-[#e5e5e5] bg-[#fafafa] text-[#333333]";
  }
}

export default function PatientAppointmentsClient() {
  const searchParams = useSearchParams();
  const initialTab = tabFromParam(searchParams.get("tab"));
  const [appointments, setAppointments] = useState<PatientAppointmentItem[]>([]);
  const [doctorOptions, setDoctorOptions] = useState<DoctorOption[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [doctorId, setDoctorId] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>("desc");
  const [error, setError] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<PatientAppointmentItem | null>(null);
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    setTab(tabFromParam(searchParams.get("tab")));
  }, [searchParams]);

  const effectiveDoctorId = useMemo(
    () => (doctorOptions.some((d) => d.id === doctorId) ? doctorId : ""),
    [doctorId, doctorOptions],
  );

  const loadAppointments = useCallback(
    async (nextPage: number, append: boolean) => {
      const requestId = ++latestRequestIdRef.current;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsRefreshing(true);
        setAppointments([]);
      }
      setError(null);
      try {
        const params = new URLSearchParams({
          tab,
          dateFilter,
          page: String(nextPage),
          limit: "10",
        });
        if (effectiveDoctorId) params.set("doctorId", effectiveDoctorId);
        const res = await fetch(`/api/patient/appointments?${params.toString()}`, {
          cache: "no-store",
        });
        if (latestRequestIdRef.current !== requestId) return;
        if (!res.ok) {
          setError("Failed to load appointments.");
          return;
        }
        const data = (await res.json()) as {
          items?: PatientAppointmentItem[];
          doctorOptions?: DoctorOption[];
          hasMore?: boolean;
          page?: number;
        };
        if (latestRequestIdRef.current !== requestId) return;
        const nextItems = Array.isArray(data.items) ? data.items : [];
        setAppointments((current) => (append ? [...current, ...nextItems] : nextItems));
        setDoctorOptions(Array.isArray(data.doctorOptions) ? data.doctorOptions : []);
        setHasMore(Boolean(data.hasMore));
        setPage(typeof data.page === "number" ? data.page : nextPage);
      } catch {
        if (latestRequestIdRef.current !== requestId) return;
        setError("Failed to load appointments.");
      } finally {
        if (latestRequestIdRef.current !== requestId) return;
        if (append) {
          setIsLoadingMore(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [dateFilter, effectiveDoctorId, tab],
  );

  useEffect(() => {
    void loadAppointments(1, false);
  }, [loadAppointments]);

  const [sentryRef] = useInfiniteScroll({
    loading: isLoadingMore,
    hasNextPage: hasMore,
    onLoadMore: () => void loadAppointments(page + 1, true),
    disabled: isRefreshing,
    rootMargin: "0px 0px 300px 0px",
  });

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col items-start gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
          <div className="min-w-0 md:flex-1">
            <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
              Appointments
            </h1>
            <Link
              href="/book-appointment"
              className="mt-1 inline-block font-montserrat text-sm text-[#2555F3] md:hidden"
            >
              Book an appointment →
            </Link>
          </div>
          <div className="hidden shrink-0 md:block">
            <Button
              asChild
              className="w-fit cursor-pointer rounded-xl md:inline-flex md:w-auto"
            >
              <Link href="/book-appointment">Book Appointment</Link>
            </Button>
          </div>
        </div>
        <p className="font-montserrat text-sm text-[#5E5E5E]">
          Manage your upcoming and past appointments.
        </p>
      </div>

      <div className="mt-6 sm:hidden">
        <select
          aria-label="Appointment status tab"
          value={tab}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "upcoming" || v === "completed" || v === "cancelled") {
              setTab(v);
            }
          }}
          className={`w-full cursor-pointer rounded-xl border border-[#e5e5e5] bg-white py-2 pl-3 pr-10 font-montserrat text-sm font-medium text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
        >
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="mt-6 hidden sm:flex sm:flex-row sm:gap-3">
        <button
          type="button"
          onClick={() => setTab("upcoming")}
          className={`cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors ${
            tab === "upcoming"
              ? "bg-[#2555F3] text-white"
              : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
          }`}
        >
          Upcoming
        </button>
        <button
          type="button"
          onClick={() => setTab("completed")}
          className={`cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors ${
            tab === "completed"
              ? "bg-[#2555F3] text-white"
              : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
          }`}
        >
          Completed
        </button>
        <button
          type="button"
          onClick={() => setTab("cancelled")}
          className={`cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors ${
            tab === "cancelled"
              ? "bg-[#2555F3] text-white"
              : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
          }`}
        >
          Cancelled
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-8 sm:gap-y-4">
        {doctorOptions.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
            <label
              htmlFor="patient-appointments-doctor-filter"
              className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
            >
              Doctor
            </label>
            <select
              id="patient-appointments-doctor-filter"
              value={effectiveDoctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className={`w-full min-w-0 cursor-pointer rounded-xl border border-[#e5e5e5] bg-white py-2 pl-3 pr-10 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
            >
              <option value="">All doctors</option>
              {doctorOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
          <label
            htmlFor="patient-appointments-date-filter"
            className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
          >
            Date
          </label>
          <select
            id="patient-appointments-date-filter"
            value={dateFilter}
            onChange={(e) => {
              const v = e.target.value;
              if (
                v === "asc" ||
                v === "desc" ||
                v === "today" ||
                v === "week" ||
                v === "month"
              ) {
                setDateFilter(v);
              }
            }}
            className={`w-full min-w-0 cursor-pointer rounded-xl border border-[#e5e5e5] bg-white py-2 pl-3 pr-10 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
          >
            <option value="desc">Latest first</option>
            <option value="asc">Earliest first</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
          <p className="font-montserrat text-sm font-medium text-[#333333]">{error}</p>
        </div>
      ) : isRefreshing ? (
        <div
          aria-busy="true"
          aria-live="polite"
          className="mt-6 grid w-full grid-cols-1 gap-4"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <AppointmentCardSkeleton key={i} />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
          <p className="font-montserrat text-sm font-medium text-[#333333]">
            {tab === "upcoming"
              ? "No upcoming appointments."
              : tab === "completed"
                ? "No completed appointments yet."
                : "No cancelled appointments."}
          </p>
          <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
            {tab === "upcoming"
              ? "Book an appointment to get started."
              : "Your appointments will show up here once available."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid w-full grid-cols-1 gap-4">
            {appointments.map((a) => {
            const consultation = consultationLabel(a.consultationType);
            return (
              <div
                key={a.id}
                className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-montaga text-lg font-semibold text-[#333333]">
                      <MontagaCapitalN text={a.doctor.name} />
                    </p>
                    {a.doctor.specialization && (
                      <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
                        {a.doctor.specialization}
                      </p>
                    )}
                    <div className="mt-3 flex flex-col gap-1 font-montserrat text-sm text-[#333333] sm:flex-row sm:flex-wrap sm:items-center">
                      <span>
                        <span className="font-medium">Date:</span>{" "}
                        {formatDateInPatientTz(a.date, a.time, a.timezone)}
                      </span>
                      <span
                        className="hidden text-[#e5e5e5] sm:mx-2 sm:inline"
                        aria-hidden
                      >
                        |
                      </span>
                      <span>
                        <span className="font-medium">Time:</span>{" "}
                        {formatTimeInPatientTz(a.date, a.time, a.timezone)}
                      </span>
                      <span
                        className="hidden text-[#e5e5e5] sm:mx-2 sm:inline"
                        aria-hidden
                      >
                        |
                      </span>
                      <span className="whitespace-nowrap">
                        <span className="font-medium">Duration:</span>{" "}
                        {a.durationMinutes} min
                      </span>
                    </div>
                    {a.consultationType === "ONLINE" && a.googleMeetUrl && (
                      <p className="mt-2 font-montserrat text-sm">
                        <a
                          href={a.googleMeetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[#2555F3] underline underline-offset-2 wrap-break-word"
                        >
                          Join Google Meet
                        </a>
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 font-montserrat text-xs font-medium ${badgeClass(
                        "consultation",
                        consultation,
                      )}`}
                    >
                      {consultation}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 font-montserrat text-xs font-medium ${badgeClass(
                        "status",
                        a.status,
                      )}`}
                    >
                      {a.status}
                    </span>
                  </div>
                </div>

                {tab === "upcoming" &&
                  !isDoctorTimeInPast(a.date, a.time, a.timezone) &&
                  a.status !== "COMPLETED" &&
                  a.status !== "CANCELLED" &&
                  (a.cancelToken || a.rescheduleToken) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.rescheduleToken && (
                        <Button
                          asChild
                          className="cursor-pointer rounded-xl font-montserrat"
                          size="sm"
                        >
                          <Link
                            href={`/reschedule?${new URLSearchParams({
                              appointmentId: a.id,
                              token: a.rescheduleToken,
                            }).toString()}`}
                          >
                            Reschedule
                          </Link>
                        </Button>
                      )}
                      {a.cancelToken && (
                        <Button
                          asChild
                          variant="outline"
                          className="cursor-pointer rounded-xl font-montserrat"
                          size="sm"
                        >
                          <Link
                            href={`/cancel?${new URLSearchParams({
                              appointmentId: a.id,
                              token: a.cancelToken,
                            }).toString()}`}
                          >
                            Cancel
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}

                {a.status === "COMPLETED" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {a.prescription && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="w-fit cursor-pointer rounded-xl border-2 border-[#b8b8b8] font-montserrat hover:border-[#8a8a8a]"
                      >
                        <Link href={`/patient/appointments/${a.id}/prescription`}>
                          View prescription
                        </Link>
                      </Button>
                    )}
                    {!a.review ? (
                      <Button
                        type="button"
                        size="sm"
                        className="w-fit cursor-pointer rounded-xl font-montserrat"
                        onClick={() => setReviewTarget(a)}
                      >
                        Leave a Review
                      </Button>
                    ) : (
                      <span className="rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-2.5 py-1 font-montserrat text-xs font-medium text-[#92400e]">
                        Reviewed {a.review.rating}/5
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
            })}
            {(hasMore || isLoadingMore) && (
              <div
                ref={sentryRef}
                className="py-2 text-center font-montserrat text-sm text-[#5E5E5E]"
              >
                {isLoadingMore ? "Loading..." : "Scroll for more"}
              </div>
            )}
        </div>
      )}
      {reviewTarget ? (
        <LeaveReviewModal
          appointmentId={reviewTarget.id}
          doctorName={reviewTarget.doctor.name}
          onClose={() => setReviewTarget(null)}
          onSubmitted={(review) => {
            setAppointments((current) =>
              current.map((appointment) =>
                appointment.id === reviewTarget.id
                  ? { ...appointment, review }
                  : appointment,
              ),
            );
            setReviewTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

