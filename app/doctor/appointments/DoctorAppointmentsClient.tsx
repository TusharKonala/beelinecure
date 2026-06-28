"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { Button } from "@/components/ui/button";
import { StaffCancelRefundPreview } from "@/components/appointments/StaffCancelRefundPreview";
import { CharCountFooter } from "@/components/form/CharCountFooter";
import { MontagaCapitalN } from "@/components/ui/MontagaCapitalN";
import { formatDateInDoctorTz, formatTimeInDoctorTz } from "@/lib/timezone-display";
import { useAppointmentsListPoll } from "@/lib/use-appointments-list-poll";
import { useDoctorAppointmentsPusher } from "@/lib/use-doctor-appointments-pusher";
import { APPOINTMENT_CANCELLATION_NOTE_MAX_CHARS } from "@/lib/appointment-schemas";
import { countChars } from "@/lib/text-char-limit";

type ConsultationType = "CLINIC" | "ONLINE";
type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
type TabKey = "upcoming" | "pending-review" | "completed" | "cancelled";
type DateFilterValue = "asc" | "desc" | "today" | "week" | "month";
const DEFAULT_DATE_FILTER: DateFilterValue = "asc";
type CancelReason = "patient_no_show" | "doctor_unavailable";

type RefundPreviewPayload = {
  tier: "full_refund" | "partial_refund" | "no_refund_no_show";
  percentage: 100 | 50 | 0;
  title: string;
  description: string;
  originalPaidAmountCents: number | null;
  eligibleRefundAmountCents: number | null;
  currency: string | null;
};

function formatRefundCents(cents: number, currency: string | null): string {
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

type DoctorAppointmentItem = {
  id: string;
  patientName: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  timezone: string;
  consultationType: ConsultationType;
  status: AppointmentStatus;
  notes: string | null;
  googleMeetUrl: string | null;
};

/** Hide native select arrow; custom chevron at `right: 0.75rem` with `pr-10` text inset. */
const SELECT_CHEVRON =
  'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23333333%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:1rem_1rem] bg-[position:right_0.75rem_center] bg-no-repeat';

function consultationLabel(type: ConsultationType) {
  return type === "ONLINE" ? "Online" : "Clinic";
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

function tabFromParam(raw: string | null): TabKey {
  if (raw === "pending-review") return "pending-review";
  if (raw === "completed") return "completed";
  if (raw === "cancelled") return "cancelled";
  return "upcoming";
}

function searchFromParam(raw: string | null): string {
  return (raw ?? "").trim();
}

export default function DoctorAppointmentsClient({
  doctorId,
}: {
  doctorId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = tabFromParam(searchParams.get("tab"));
  const initialSearch = searchFromParam(searchParams.get("search"));
  const [appointments, setAppointments] = useState<DoctorAppointmentItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [search, setSearch] = useState(initialSearch);
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);
  const [filterOnDate, setFilterOnDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DoctorAppointmentItem | null>(null);
  const [cancelReason, setCancelReason] = useState<CancelReason | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  const [refundPreview, setRefundPreview] = useState<RefundPreviewPayload | null>(
    null,
  );
  const [refundPreviewLoading, setRefundPreviewLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setTab(tabFromParam(searchParams.get("tab")));
    setSearch(searchFromParam(searchParams.get("search")));
  }, [searchParams]);

  useEffect(() => {
    if (!cancelTarget) {
      setRefundPreview(null);
      setRefundPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setRefundPreviewLoading(true);
    setRefundPreview(null);
    const previewParams = new URLSearchParams({
      appointmentId: cancelTarget.id,
    });
    if (cancelReason) {
      previewParams.set("reason", cancelReason);
    }
    void fetch(`/api/appointments/refund-preview?${previewParams.toString()}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json().catch(() => null)) as
          | { refundPreview?: RefundPreviewPayload | null }
          | null;
        return data?.refundPreview ?? null;
      })
      .then((preview) => {
        if (cancelled) return;
        setRefundPreview(preview);
      })
      .catch(() => {
        if (cancelled) return;
        setRefundPreview(null);
      })
      .finally(() => {
        if (cancelled) return;
        setRefundPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cancelTarget, cancelReason]);

  const loadAppointments = useCallback(async (
    nextPage: number,
    append: boolean,
    options?: { silent?: boolean },
  ) => {
    const silent = options?.silent === true;
    const requestId = ++latestRequestIdRef.current;
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const params = new URLSearchParams({
        tab,
        page: String(nextPage),
        limit: "5",
      });
      if (filterOnDate) {
        params.set("onDate", filterOnDate);
      } else {
        params.set("dateFilter", dateFilter);
      }
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/doctor/appointments?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (latestRequestIdRef.current !== requestId) return;
        if (!silent) setError("Failed to load appointments.");
        return;
      }
      const data = (await res.json()) as {
        items?: DoctorAppointmentItem[];
        hasMore?: boolean;
        page?: number;
      };
      if (latestRequestIdRef.current !== requestId) return;
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setAppointments((current) => (append ? [...current, ...nextItems] : nextItems));
      setHasMore(Boolean(data.hasMore));
      setPage(typeof data.page === "number" ? data.page : nextPage);
    } catch {
      if (latestRequestIdRef.current !== requestId) return;
      if (!silent) setError("Failed to load appointments.");
    } finally {
      if (latestRequestIdRef.current !== requestId) return;
      if (!silent) setIsLoading(false);
    }
  }, [dateFilter, filterOnDate, search, tab]);

  useEffect(() => {
    void loadAppointments(1, false);
  }, [loadAppointments]);

  const silentRefresh = useCallback(
    () => loadAppointments(1, false, { silent: true }),
    [loadAppointments],
  );

  useAppointmentsListPoll({
    tab,
    page,
    pollBlocked: Boolean(cancelTarget),
    refresh: silentRefresh,
  });

  useDoctorAppointmentsPusher({
    doctorId,
    enabled: page === 1,
    onAppointmentsChanged: silentRefresh,
  });

  const hasActiveFilters =
    search.trim() !== "" ||
    dateFilter !== DEFAULT_DATE_FILTER ||
    filterOnDate !== "";

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setDateFilter(DEFAULT_DATE_FILTER);
    setFilterOnDate("");

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("search");
    const qs = nextParams.toString();
    router.replace(qs ? `/doctor/appointments?${qs}` : "/doctor/appointments", {
      scroll: false,
    });
  }, [router, searchParams]);

  const [sentryRef] = useInfiniteScroll({
    loading: isLoading,
    hasNextPage: hasMore,
    onLoadMore: () => void loadAppointments(page + 1, true),
    disabled: false,
    rootMargin: "0px 0px 300px 0px",
  });

  const cancelNoteOverLimit =
    countChars(cancelNote) > APPOINTMENT_CANCELLATION_NOTE_MAX_CHARS;

  async function confirmCancelAppointment() {
    if (!cancelTarget) return;
    setIsCanceling(true);
    try {
      const res = await fetch("/api/doctor/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: cancelTarget.id,
          reason: cancelReason ?? undefined,
          cancellationNote: cancelNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setError("Failed to cancel appointment.");
        return;
      }
      setCancelTarget(null);
      setCancelReason(null);
      setCancelNote("");
      await loadAppointments(1, false);
    } catch {
      setError("Failed to cancel appointment.");
    } finally {
      setIsCanceling(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
          Appointments
        </h1>
        <p className="font-montserrat text-sm text-[#5E5E5E]">
          View appointments by status.
        </p>
      </div>

      <div className="mt-6 sm:hidden">
        <select
          aria-label="Appointment status tab"
          value={tab}
          onChange={(e) => {
            const v = e.target.value;
            if (
              v === "upcoming" ||
              v === "pending-review" ||
              v === "completed" ||
              v === "cancelled"
            ) {
              setTab(v);
            }
          }}
          className={`w-full cursor-pointer rounded-xl border border-[#e5e5e5] bg-white py-2 pl-3 pr-10 font-montserrat text-sm font-medium text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
        >
          <option value="upcoming">Upcoming</option>
          <option value="pending-review">Pending Review</option>
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
          onClick={() => setTab("pending-review")}
          className={`cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors ${
            tab === "pending-review"
              ? "bg-[#2555F3] text-white"
              : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
          }`}
        >
          Pending Review
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-montserrat text-xs text-[#5E5E5E]">
          Filter by patient and date.
        </p>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="cursor-pointer font-montserrat text-xs text-[#777777] underline underline-offset-4 transition hover:text-[#2555F3]"
          >
            Clear all filters
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-8 sm:gap-y-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
          <label
            htmlFor="doctor-appointments-search"
            className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
          >
            Patient
          </label>
          <input
            id="doctor-appointments-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or phone"
            className="w-full min-w-0 rounded-xl border border-[#e5e5e5] bg-white py-2 px-3 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
          <label
            htmlFor="doctor-appointments-filter-on-date"
            className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
          >
            Filter by date
          </label>
          <div className="flex min-w-0 items-center gap-2">
            <input
              id="doctor-appointments-filter-on-date"
              type="date"
              value={filterOnDate}
              onChange={(e) => setFilterOnDate(e.target.value)}
              className="min-w-0 flex-1 cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] shadow-sm [color-scheme:light] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
            />
            {filterOnDate ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 cursor-pointer rounded-xl font-montserrat text-xs font-medium"
                onClick={() => setFilterOnDate("")}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
          <label
            htmlFor="doctor-appointments-sort"
            className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
          >
            Sort
          </label>
          <select
            id="doctor-appointments-sort"
            value={dateFilter}
            disabled={Boolean(filterOnDate)}
            title={
              filterOnDate
                ? "Clear the date filter to change sort"
                : undefined
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "asc" || v === "desc" || v === "today" || v === "week" || v === "month") {
                setDateFilter(v);
              }
            }}
            className={`w-full min-w-0 cursor-pointer rounded-xl border border-[#e5e5e5] bg-white py-2 pl-3 pr-10 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 disabled:cursor-not-allowed disabled:opacity-50 ${SELECT_CHEVRON}`}
          >
            <option value="asc">Earliest first</option>
            <option value="desc">Latest first</option>
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
      ) : !isLoading && appointments.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
          <p className="font-montserrat text-sm font-medium text-[#333333]">
            {filterOnDate
              ? "No appointments on this date."
              : tab === "upcoming"
                ? "No upcoming appointments."
                : tab === "pending-review"
                  ? "No appointments pending review."
                  : tab === "completed"
                    ? "No completed appointments yet."
                    : "No cancelled appointments."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid w-full grid-cols-1 gap-4">
          {appointments.map((a) => {
            const consultation = consultationLabel(a.consultationType);
            const shouldShowGoogleMeetLink =
              (tab === "upcoming" || tab === "pending-review") &&
              a.consultationType === "ONLINE" &&
              Boolean(a.googleMeetUrl);
            return (
              <div
                key={a.id}
                className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-montaga text-lg font-semibold text-[#333333]">
                      <MontagaCapitalN text={a.patientName} />
                    </p>
                    <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">{a.email}</p>
                    <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">{a.phone}</p>
                    <div className="mt-3 flex flex-col gap-1 font-montserrat text-sm text-[#333333] min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-center">
                      <span>
                        <span className="font-medium">Date:</span>{" "}
                        {formatDateInDoctorTz(a.date, a.time, a.timezone)}
                      </span>
                      <span
                        className="hidden text-[#e5e5e5] min-[400px]:mx-2 min-[400px]:inline"
                        aria-hidden
                      >
                        |
                      </span>
                      <span>
                        <span className="font-medium">Time:</span>{" "}
                        {formatTimeInDoctorTz(a.date, a.time, a.timezone)}
                      </span>
                    </div>
                    {shouldShowGoogleMeetLink && (
                      <p className="mt-2 font-montserrat text-sm">
                        <a
                          href={a.googleMeetUrl!}
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

                {tab === "upcoming" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer rounded-xl font-montserrat"
                      size="sm"
                      onClick={() => {
                        setCancelTarget(a);
                        setCancelReason(null);
                        setCancelNote("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                {tab === "pending-review" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="cursor-pointer rounded-xl font-montserrat"
                      size="sm"
                      onClick={() => router.push(`/doctor/appointments/${a.id}/prescription`)}
                    >
                      Add Prescription
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer rounded-xl font-montserrat"
                      size="sm"
                      onClick={() => {
                        setCancelTarget(a);
                        setCancelReason("patient_no_show");
                        setCancelNote("");
                      }}
                    >
                      Patient did not show up
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer rounded-xl font-montserrat"
                      size="sm"
                      onClick={() => {
                        setCancelTarget(a);
                        setCancelReason("doctor_unavailable");
                        setCancelNote("");
                      }}
                    >
                      Doctor was unavailable
                    </Button>
                  </div>
                )}
                {tab === "completed" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="w-fit cursor-pointer rounded-xl border-2 border-[#b8b8b8] font-montserrat hover:border-[#8a8a8a]"
                    >
                      <Link href={`/doctor/prescriptions/${a.id}/view?from=appointments`}>
                        View prescription
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      className="w-fit cursor-pointer rounded-xl font-montserrat"
                    >
                      <Link href={`/doctor/appointments/${a.id}/prescription`}>
                        Edit prescription
                      </Link>
                    </Button>
                  </div>
                )}

                {a.notes && (
                  <p className="mt-3 whitespace-pre-wrap font-montserrat text-sm text-[#333333]">
                    <span className="font-medium">Notes:</span> {a.notes}
                  </p>
                )}
              </div>
            );
          })}
          {(hasMore || isLoading) && (
            <div
              ref={sentryRef}
              className="py-2 text-center font-montserrat text-sm text-[#5E5E5E]"
            >
              {isLoading ? "Loading..." : "Scroll for more"}
            </div>
          )}
        </div>
      )}
      {mounted &&
        cancelTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-100 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="doctor-cancel-appointment-title"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-black/40"
              aria-label="Close dialog"
              onClick={() => {
                if (!isCanceling) {
                  setCancelTarget(null);
                  setCancelReason(null);
                  setCancelNote("");
                }
              }}
            />
            <div
              className="relative z-1 w-full max-w-md rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="doctor-cancel-appointment-title"
                className="font-montaga text-xl font-semibold text-[#333333]"
              >
                Cancel appointment?
              </h2>
              <p className="mt-3 font-montserrat text-sm leading-relaxed text-[#5E5E5E]">
                This will cancel the appointment for{" "}
                <span className="font-medium text-[#333333]">{cancelTarget.patientName}</span>
                {cancelReason === "patient_no_show"
                  ? " (patient did not show up — no refund)."
                  : cancelReason === "doctor_unavailable"
                    ? " (doctor unavailable — patient will be notified and refunded if applicable)."
                    : "."}
              </p>
              <div className="mt-4 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3">
                <StaffCancelRefundPreview
                  loading={refundPreviewLoading}
                  refundPreview={refundPreview}
                  cancelReason={cancelReason}
                  formatRefundCents={formatRefundCents}
                />
              </div>
              <div className="mt-4">
                <label
                  htmlFor="doctor-cancel-note"
                  className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
                >
                  Note for patient (optional)
                </label>
                <textarea
                  id="doctor-cancel-note"
                  rows={3}
                  maxLength={APPOINTMENT_CANCELLATION_NOTE_MAX_CHARS}
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                  placeholder="This note will be shared with the patient in the cancellation email."
                  className="w-full rounded-xl border border-[#e5e5e5] px-3 py-2 font-montserrat text-sm"
                />
                <CharCountFooter
                  value={cancelNote}
                  maxChars={APPOINTMENT_CANCELLATION_NOTE_MAX_CHARS}
                  overLimitHint=" — shorten the note to cancel."
                />
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  className="cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-4 py-2.5 font-montserrat text-sm font-medium text-[#333333] transition-colors hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    setCancelTarget(null);
                    setCancelReason(null);
                    setCancelNote("");
                  }}
                  disabled={
                    isCanceling ||
                    refundPreviewLoading
                  }
                >
                  Keep appointment
                </button>
                <button
                  type="button"
                  className="cursor-pointer rounded-xl bg-[#dc2626] px-4 py-2.5 font-montserrat text-sm font-medium text-white transition-colors hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void confirmCancelAppointment()}
                  disabled={
                    isCanceling ||
                    refundPreviewLoading ||
                    cancelNoteOverLimit
                  }
                >
                  {isCanceling ? "Cancelling..." : "Confirm cancel"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
