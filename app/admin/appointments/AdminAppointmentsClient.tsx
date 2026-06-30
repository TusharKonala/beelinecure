"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { useQueries, useQuery, keepPreviousData } from "@tanstack/react-query";
import { SetAvailabilityCalendar } from "@/app/doctor/my-schedule/SetAvailabilityCalendar";
import { Button } from "@/components/ui/button";
import { StaffCancelRefundPreview } from "@/components/appointments/StaffCancelRefundPreview";
import { CharCountFooter } from "@/components/form/CharCountFooter";
import { MontagaCapitalN } from "@/components/ui/MontagaCapitalN";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDateInDoctorTz,
  formatDateInPatientTz,
  formatTimeInDoctorTz,
  formatTimeInPatientTz,
  todayYmdInTimeZone,
} from "@/lib/timezone-display";
import {
  filterReschedulableSlots,
  type BookableSlotRef,
} from "@/lib/reschedule-slots";
import { useDoctorSlotsPusher } from "@/lib/use-doctor-slots-pusher";
import { SLOT_NO_LONGER_AVAILABLE_MESSAGE } from "@/lib/slot-hold-shared";
import type { PatientConsultationChoice } from "@/lib/doctor-availability-slots";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { currencyForTimezone } from "@/lib/currency";
import { useAppointmentsListPoll } from "@/lib/use-appointments-list-poll";
import { APPOINTMENT_CANCELLATION_NOTE_MAX_CHARS } from "@/lib/appointment-schemas";
import { isAppointmentReschedulableFromParts } from "@/lib/appointment-reschedule-eligibility";
import { RESCHEDULE_ONLY_MORE_THAN_24H } from "@/lib/reschedule-policy-copy";
import { countChars } from "@/lib/text-char-limit";

type ConsultationType = "CLINIC" | "ONLINE";
type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
type TabKey = "upcoming" | "pending-review" | "completed" | "cancelled";
type DateFilterValue = "asc" | "desc" | "today" | "week" | "month";
const DEFAULT_DATE_FILTER: DateFilterValue = "desc";
/** Must match `DEFAULT_HORIZON_DAYS` in `available-dates` API (inclusive span = this + 1). */
const AVAILABILITY_RANGE_DAY_OFFSET = 60;
type CancelReason = "patient_no_show" | "doctor_unavailable";
type AvailabilityDateChunk = { from: string; to: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function daysInMonthUtc(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function lastYmdOfMonthUtc(year: number, month0: number): string {
  const dim = daysInMonthUtc(year, month0);
  return `${year}-${pad2(month0 + 1)}-${pad2(dim)}`;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

type RefundPreviewPayload = {
  tier: "full_refund" | "partial_refund" | "no_refund_no_show";
  percentage: 100 | 50 | 0;
  title: string;
  description: string;
  originalPaidAmountCents: number | null;
  eligibleRefundAmountCents: number | null;
  currency: string | null;
  equivalentAmountCents?: number | null;
  equivalentCurrency?: string | null;
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

function browserCurrencyGuess(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  return currencyForTimezone(timezone);
}

function normaliseCurrencyCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

type AdminAppointmentItem = {
  id: string;
  doctorId: string;
  patientName: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  timezone: string;
  patientTimezone: string;
  durationMinutes: number;
  consultationType: ConsultationType;
  status: AppointmentStatus;
  notes: string | null;
  googleMeetUrl: string | null;
  doctor: {
    name: string;
    specialization: string;
  };
};

const SELECT_CHEVRON =
  'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23333333%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:1rem_1rem] bg-[position:right_0.75rem_center] bg-no-repeat';

function consultationLabel(type: ConsultationType) {
  return type === "ONLINE" ? "Online" : "Clinic";
}

function consultationTypeLabel(type: "CLINIC" | "ONLINE"): string {
  return type === "ONLINE" ? "online" : "in-clinic";
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getAvailableDatesChunk(
  doctorId: string,
  consultationType: PatientConsultationChoice,
  from: string,
  to: string,
  slotDurationMinutes: number,
): Promise<{ dates: string[] }> {
  const params = new URLSearchParams({
    consultationType,
    from,
    to,
    slotDurationMinutes: String(slotDurationMinutes),
  });
  const res = await fetch(
    `/api/doctors/${doctorId}/available-dates?${params.toString()}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("Failed to fetch available dates");
  return res.json();
}

async function getSlots(
  doctorId: string,
  date: string,
  excludeAppointmentId: string,
): Promise<{
  slots: string[];
  slotDetails: {
    startTime: string;
    slotDurationMinutes: number;
    consultationType?: "CLINIC" | "ONLINE" | "BOTH";
  }[];
  doctorTimezone: string;
  slotDurationMinutes: number;
}> {
  const res = await fetch(
    `/api/doctors/${doctorId}/slots?date=${encodeURIComponent(
      date,
    )}&excludeAppointmentId=${encodeURIComponent(excludeAppointmentId)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch slots");
  return res.json();
}

async function fetchAdminRescheduleEligibility(
  appointmentId: string,
): Promise<string | undefined> {
  const res = await fetch(
    `/api/admin/appointments/reschedule?appointmentId=${encodeURIComponent(
      appointmentId,
    )}`,
    { cache: "no-store" },
  );
  const json = (await res.json().catch(() => null)) as {
    status?: string;
  } | null;
  return json?.status;
}

export default function AdminAppointmentsClient() {
  const [appointments, setAppointments] = useState<AdminAppointmentItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [tab, setTab] = useState<TabKey>("upcoming");
  const [patientSearch, setPatientSearch] = useState("");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);
  const [isLoading, setIsLoading] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<AdminAppointmentItem | null>(null);
  const [cancelReason, setCancelReason] = useState<CancelReason | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  const [refundPreview, setRefundPreview] = useState<RefundPreviewPayload | null>(
    null,
  );
  const [refundPreviewLoading, setRefundPreviewLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserCurrency] = useState<string>(() => browserCurrencyGuess());
  const latestRequestIdRef = useRef(0);

  const [rescheduleTarget, setRescheduleTarget] = useState<AdminAppointmentItem | null>(
    null,
  );
  const [rescheduleStep, setRescheduleStep] = useState<"pick" | "confirm">("pick");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<BookableSlotRef | null>(null);
  const [hasSelectionInteraction, setHasSelectionInteraction] = useState(false);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleCancelled, setRescheduleCancelled] = useState(false);
  const cancellationCheckRef = useRef(false);
  const isMountedRef = useRef(true);
  /** Armed once the appointment's date is seen in availability, so we only verify on a true present -> absent drop. */
  const apptDatePresentRef = useRef(false);
  /** One-time calendar preselect of the original appointment date when it is enabled. */
  const initialDateAppliedRef = useRef(false);
  const [slotTzView, setSlotTzView] = useState<"doctor" | "patient">("doctor");
  const [availabilityDateChunks, setAvailabilityDateChunks] = useState<
    AvailabilityDateChunk[]
  >([]);
  const prevRescheduleScopeRef = useRef("");

  useEffect(() => {
    setMounted(true);
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
      targetCurrency: browserCurrency,
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
  }, [cancelTarget, cancelReason, browserCurrency]);

  const loadAppointments = useCallback(
    async (
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
          dateFilter,
          page: String(nextPage),
          limit: "5",
        });
        if (patientSearch.trim()) params.set("patientSearch", patientSearch.trim());
        if (doctorSearch.trim()) params.set("doctorSearch", doctorSearch.trim());
        const res = await fetch(`/api/admin/appointments?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (latestRequestIdRef.current !== requestId) return;
          if (!silent) setError("Failed to load appointments.");
          return;
        }
        const data = (await res.json()) as {
          items?: AdminAppointmentItem[];
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
    },
    [dateFilter, patientSearch, doctorSearch, tab],
  );

  useEffect(() => {
    void loadAppointments(1, false);
  }, [loadAppointments]);

  const silentRefresh = useCallback(
    () => loadAppointments(1, false, { silent: true }),
    [loadAppointments],
  );

  // TODO: Admin poll still refetches page 1 only. On page 2+, background refresh
  // resets the list to 5 items. Apply refreshLoadedPages pattern from
  // DoctorAppointmentsClient when admin realtime is prioritized.
  useAppointmentsListPoll({
    tab,
    pollBlocked: Boolean(cancelTarget || rescheduleTarget),
    refresh: silentRefresh,
  });

  const hasActiveFilters =
    patientSearch.trim() !== "" ||
    doctorSearch.trim() !== "" ||
    dateFilter !== DEFAULT_DATE_FILTER;

  const clearAllFilters = useCallback(() => {
    setPatientSearch("");
    setDoctorSearch("");
    setDateFilter(DEFAULT_DATE_FILTER);
  }, []);

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
      const res = await fetch("/api/admin/appointments", {
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

  useLayoutEffect(() => {
    if (!rescheduleTarget || rescheduleStep !== "pick") {
      setAvailabilityDateChunks([]);
      prevRescheduleScopeRef.current = "";
      return;
    }
    const scope = rescheduleTarget.id;
    if (prevRescheduleScopeRef.current === scope) return;
    prevRescheduleScopeRef.current = scope;
    const from = todayYmdInTimeZone(rescheduleTarget.timezone);
    setAvailabilityDateChunks([
      { from, to: addDaysToYmd(from, AVAILABILITY_RANGE_DAY_OFFSET) },
    ]);
  }, [rescheduleTarget, rescheduleStep]);

  const rescheduleMinDate = useMemo(
    () =>
      rescheduleTarget
        ? todayYmdInTimeZone(rescheduleTarget.timezone)
        : todayISO(),
    [rescheduleTarget],
  );

  const availabilityDateQueries = useQueries({
    queries:
      rescheduleTarget &&
      rescheduleStep === "pick" &&
      availabilityDateChunks.length > 0
        ? availabilityDateChunks.map(({ from, to }) => ({
            queryKey: [
              "admin-reschedule-available-dates",
              rescheduleTarget.doctorId,
              rescheduleTarget.consultationType,
              rescheduleTarget.durationMinutes,
              from,
              to,
            ] as const,
            queryFn: () =>
              getAvailableDatesChunk(
                rescheduleTarget.doctorId,
                rescheduleTarget.consultationType,
                from,
                to,
                rescheduleTarget.durationMinutes,
              ),
            enabled: Boolean(rescheduleTarget.doctorId),
            staleTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
          }))
        : [],
  });

  const enabledDateSet = useMemo(() => {
    const next = new Set<string>();
    for (const q of availabilityDateQueries) {
      for (const d of q.data?.dates ?? []) next.add(d);
    }
    return next;
  }, [availabilityDateQueries]);

  const availabilityCalendarFetching = useMemo(
    () => availabilityDateQueries.some((q) => q.isPending),
    [availabilityDateQueries],
  );
  const availabilityCalendarInitialLoading = useMemo(
    () => availabilityCalendarFetching && enabledDateSet.size === 0,
    [availabilityCalendarFetching, enabledDateSet.size],
  );
  const availabilityCalendarExtending = useMemo(
    () => availabilityCalendarFetching && enabledDateSet.size > 0,
    [availabilityCalendarFetching, enabledDateSet.size],
  );

  useEffect(() => {
    if (!rescheduleTarget || rescheduleStep !== "pick") return;
    if (availabilityCalendarFetching) return;
    if (enabledDateSet.size === 0) return;
    if (initialDateAppliedRef.current) return;

    initialDateAppliedRef.current = true;
    if (enabledDateSet.has(rescheduleTarget.date)) {
      setSelectedDate(rescheduleTarget.date);
    }
  }, [
    rescheduleTarget,
    rescheduleStep,
    availabilityCalendarFetching,
    enabledDateSet,
  ]);

  useEffect(() => {
    if (!rescheduleTarget || rescheduleStep !== "pick") return;
    if (availabilityCalendarFetching) return;
    if (enabledDateSet.size === 0) return;
    if (!selectedDate) return;
    if (enabledDateSet.has(selectedDate)) return;
    if (!hasSelectionInteraction) return;

    setSelectedDate("");
    setSelectedSlot(null);
    setRescheduleError(
      "The date you selected is no longer available. Please choose another date.",
    );
  }, [
    rescheduleTarget,
    rescheduleStep,
    availabilityCalendarFetching,
    enabledDateSet,
    selectedDate,
    hasSelectionInteraction,
  ]);

  const onRescheduleCalendarSelect = useCallback((ymd: string) => {
    setHasSelectionInteraction(true);
    setSelectedDate(ymd);
    setSelectedSlot(null);
    setRescheduleError(null);
  }, []);

  const onRescheduleCalendarViewingMonthChange = useCallback(
    (year: number, month0: number) => {
      setAvailabilityDateChunks((prev) => {
        if (prev.length === 0) return prev;
        const coverageTo = prev.reduce(
          (max, c) => (c.to > max ? c.to : max),
          prev[0]!.to,
        );
        const lastDay = lastYmdOfMonthUtc(year, month0);
        if (lastDay <= coverageTo) return prev;
        const fromNext = addDaysToYmd(coverageTo, 1);
        const toNext = lastDay;
        if (fromNext > toNext) return prev;

        const additions: AvailabilityDateChunk[] = [];
        let cursor = fromNext;
        while (cursor <= toNext) {
          const tentativeEnd = addDaysToYmd(
            cursor,
            AVAILABILITY_RANGE_DAY_OFFSET,
          );
          const chunkTo = minYmd(tentativeEnd, toNext);
          if (!prev.some((c) => c.from === cursor && c.to === chunkTo)) {
            additions.push({ from: cursor, to: chunkTo });
          }
          cursor = addDaysToYmd(chunkTo, 1);
        }
        if (additions.length === 0) return prev;
        return [...prev, ...additions];
      });
    },
    [],
  );

  const markRescheduleTerminalCancelled = useCallback(async () => {
    setRescheduleCancelled(true);
    await loadAppointments(1, false, { silent: true });
  }, [loadAppointments]);

  const verifyRescheduleStillActive = useCallback(async () => {
    const target = rescheduleTarget;
    if (!target || cancellationCheckRef.current) return;
    cancellationCheckRef.current = true;
    try {
      for (let i = 0; i < 6; i++) {
        const status = await fetchAdminRescheduleEligibility(target.id);
        if (!isMountedRef.current) return;
        if (status && status !== "eligible") {
          await markRescheduleTerminalCancelled();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1300));
        if (!isMountedRef.current) return;
      }
    } finally {
      cancellationCheckRef.current = false;
    }
  }, [rescheduleTarget, markRescheduleTerminalCancelled]);

  useDoctorSlotsPusher({
    doctorId: rescheduleTarget?.doctorId ?? "",
    enabled: !!rescheduleTarget?.doctorId,
    queryKeys: {
      slots: ["admin-reschedule-slots", rescheduleTarget?.id ?? ""],
      availableDates: [
        "admin-reschedule-available-dates",
        rescheduleTarget?.doctorId ?? "",
      ],
    },
    // Admin selectedDate is already doctor-local, so it maps directly to the
    // doctor-local dates carried by slot-updated / availability-changed events.
    currentDoctorDates: selectedDate ? [selectedDate] : [],
  });

  // Holiday detection: when the appointment's own date drops out of
  // availability (its whole day was cleared), re-verify eligibility. Narrowed
  // to a true present -> absent transition so benign single-slot edits on the
  // day don't kick off needless background checks.
  useEffect(() => {
    if (!rescheduleTarget) return;
    if (rescheduleCancelled) return;
    if (rescheduleSubmitting) return;
    if (availabilityCalendarFetching) return;
    if (enabledDateSet.size === 0) return;
    const apptDate = rescheduleTarget.date;
    if (enabledDateSet.has(apptDate)) {
      apptDatePresentRef.current = true;
      return;
    }
    if (apptDatePresentRef.current) {
      apptDatePresentRef.current = false;
      void verifyRescheduleStillActive();
    }
  }, [
    rescheduleTarget,
    rescheduleCancelled,
    rescheduleSubmitting,
    availabilityCalendarFetching,
    enabledDateSet,
    verifyRescheduleStillActive,
  ]);

  const slotsEnabled =
    !!rescheduleTarget && rescheduleStep === "pick" && !!selectedDate;
  const {
    data: slotsData,
    isLoading: slotsLoading,
    isFetching: slotsFetching,
    isPlaceholderData,
  } = useQuery({
    queryKey: ["admin-reschedule-slots", rescheduleTarget?.id, rescheduleTarget?.doctorId, selectedDate],
    enabled: slotsEnabled && !!rescheduleTarget?.doctorId,
    queryFn: () =>
      getSlots(
        rescheduleTarget!.doctorId,
        selectedDate,
        rescheduleTarget!.id,
      ),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const doctorTz = slotsData?.doctorTimezone ?? rescheduleTarget?.timezone ?? "UTC";
  const slotDetails = slotsData?.slotDetails ?? [];
  const slotsInitialLoading = slotsLoading && !slotsData;
  const slotsBackgroundFetching =
    slotsFetching && !!slotsData && isPlaceholderData;
  const filteredSlots =
    rescheduleTarget && selectedDate
      ? filterReschedulableSlots({
          slotDetails,
          bookedDurationMinutes: rescheduleTarget.durationMinutes,
          bookedConsultationType: rescheduleTarget.consultationType,
          selectedDate,
          doctorTimezone: doctorTz,
        })
      : [];
  const hasSelectableSlots = filteredSlots.some(
    (ref) =>
      !(
        rescheduleTarget &&
        ref.startTime === rescheduleTarget.time &&
        ref.doctorDate === rescheduleTarget.date
      ),
  );

  const isCurrentAppointmentSlot =
    !!rescheduleTarget &&
    !!selectedSlot &&
    selectedSlot.doctorDate === rescheduleTarget.date &&
    selectedSlot.startTime === rescheduleTarget.time;
  const shouldBlockCurrentAppointmentSlot =
    hasSelectionInteraction && isCurrentAppointmentSlot;

  useEffect(() => {
    if (!selectedSlot) return;
    if (slotsInitialLoading) return;
    const stillAvailable = filteredSlots.some(
      (ref) =>
        ref.startTime === selectedSlot.startTime &&
        ref.doctorDate === selectedSlot.doctorDate,
    );
    if (stillAvailable) {
      setRescheduleError((prev) =>
        prev === SLOT_NO_LONGER_AVAILABLE_MESSAGE ? null : prev,
      );
      return;
    }
    const wasCurrentAppointment =
      !!rescheduleTarget &&
      selectedSlot.doctorDate === rescheduleTarget.date &&
      selectedSlot.startTime === rescheduleTarget.time;
    if (wasCurrentAppointment) {
      // Holiday verification must run even during submit — not a slot-unavailable alert.
      void verifyRescheduleStillActive();
      setSelectedSlot(null);
      return;
    }
    if (rescheduleSubmitting) {
      setSelectedSlot(null);
      return;
    }
    if (hasSelectionInteraction) {
      setRescheduleError(SLOT_NO_LONGER_AVAILABLE_MESSAGE);
    }
    setSelectedSlot(null);
  }, [
    selectedSlot,
    selectedDate,
    filteredSlots,
    rescheduleTarget,
    hasSelectionInteraction,
    slotsInitialLoading,
    rescheduleSubmitting,
    verifyRescheduleStillActive,
  ]);

  function openReschedule(a: AdminAppointmentItem) {
    if (
      !isAppointmentReschedulableFromParts({
        status: a.status,
        dateParam: a.date,
        time: a.time,
        timezone: a.timezone,
      })
    ) {
      return;
    }
    setRescheduleTarget(a);
    setRescheduleStep("pick");
    setSelectedDate("");
    setSelectedSlot(null);
    setHasSelectionInteraction(false);
    setRescheduleError(null);
    setRescheduleCancelled(false);
    apptDatePresentRef.current = false;
    initialDateAppliedRef.current = false;
    cancellationCheckRef.current = false;
  }

  function closeReschedule() {
    if (rescheduleSubmitting) return;
    setRescheduleTarget(null);
    setRescheduleStep("pick");
    setSelectedSlot(null);
    setRescheduleError(null);
    setRescheduleCancelled(false);
    apptDatePresentRef.current = false;
    initialDateAppliedRef.current = false;
    cancellationCheckRef.current = false;
  }

  async function submitAdminReschedule() {
    if (!rescheduleTarget || !selectedSlot || rescheduleSubmitting) return;
    if (isCurrentAppointmentSlot) return;
    setRescheduleSubmitting(true);
    setRescheduleError(null);
    try {
      const eligibility = await fetchAdminRescheduleEligibility(
        rescheduleTarget.id,
      );
      if (eligibility !== "eligible") {
        await markRescheduleTerminalCancelled();
        return;
      }

      const res = await fetch("/api/admin/appointments/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: rescheduleTarget.id,
          date: selectedSlot.doctorDate,
          time: selectedSlot.startTime,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === "Appointment is cancelled") {
          await markRescheduleTerminalCancelled();
          return;
        }
        setRescheduleError(
          data.error ?? "Could not reschedule. The slot may no longer be available.",
        );
        return;
      }
      closeReschedule();
      await loadAppointments(1, false);
    } catch {
      setRescheduleError("Could not reschedule. Please try again.");
    } finally {
      setRescheduleSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
          Appointments
        </h1>
        <p className="font-montserrat text-sm text-[#5E5E5E]">
          View and manage all appointments by status.
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
        {(
          [
            ["upcoming", "Upcoming"],
            ["pending-review", "Pending Review"],
            ["completed", "Completed"],
            ["cancelled", "Cancelled"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors ${
              tab === key
                ? "bg-[#2555F3] text-white"
                : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-montserrat text-xs text-[#5E5E5E]">
          Filter by patient, doctor, and date.
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
            htmlFor="admin-appointments-patient-search"
            className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
          >
            Patient
          </label>
          <input
            id="admin-appointments-patient-search"
            type="text"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder="Search name, email, or phone"
            className="w-full min-w-0 rounded-xl border border-[#e5e5e5] bg-white py-2 px-3 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
          <label
            htmlFor="admin-appointments-doctor-search"
            className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
          >
            Doctor
          </label>
          <input
            id="admin-appointments-doctor-search"
            type="text"
            value={doctorSearch}
            onChange={(e) => setDoctorSearch(e.target.value)}
            placeholder="Search name, email, or phone"
            className="w-full min-w-0 rounded-xl border border-[#e5e5e5] bg-white py-2 px-3 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
          <label
            htmlFor="admin-appointments-date-filter"
            className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
          >
            Date
          </label>
          <select
            id="admin-appointments-date-filter"
            value={dateFilter}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "asc" || v === "desc" || v === "today" || v === "week" || v === "month") {
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
      ) : !isLoading && appointments.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
          <p className="font-montserrat text-sm font-medium text-[#333333]">
            {tab === "upcoming"
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
                      <MontagaCapitalN text={a.doctor.name} />
                    </p>
                    {a.doctor.specialization && (
                      <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
                        {a.doctor.specialization}
                      </p>
                    )}
                    <p className="mt-3 font-montserrat text-sm font-medium text-[#333333]">
                      Patient: <MontagaCapitalN text={a.patientName} />
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
                    {isAppointmentReschedulableFromParts({
                      status: a.status,
                      dateParam: a.date,
                      time: a.time,
                      timezone: a.timezone,
                    }) ? (
                      <Button
                        type="button"
                        className="cursor-pointer rounded-xl font-montserrat"
                        size="sm"
                        onClick={() => openReschedule(a)}
                      >
                        Reschedule
                      </Button>
                    ) : null}
                  </div>
                )}
                {tab === "pending-review" && (
                  <div className="mt-3 flex flex-wrap gap-2">
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
            aria-labelledby="admin-cancel-appointment-title"
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
                id="admin-cancel-appointment-title"
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
                  showEquivalentCurrency
                  normaliseCurrencyCode={normaliseCurrencyCode}
                />
              </div>
              <div className="mt-4">
                <label
                  htmlFor="admin-cancel-note"
                  className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
                >
                  Note for patient (optional)
                </label>
                <textarea
                  id="admin-cancel-note"
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

      {mounted &&
        rescheduleTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-100 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-reschedule-title"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-black/40"
              aria-label="Close dialog"
              onClick={() => closeReschedule()}
            />
            <div
              className="relative z-1 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="admin-reschedule-title"
                className="font-montaga text-xl font-semibold text-[#333333]"
              >
                {rescheduleCancelled
                  ? "Appointment cancelled"
                  : rescheduleStep === "pick"
                    ? "Reschedule appointment"
                    : "Confirm reschedule"}
              </h2>
              {rescheduleCancelled ? (
                <div className="mt-4 flex flex-col gap-4">
                  <p className="font-montserrat text-sm text-[#5E5E5E]">
                    This appointment has been cancelled because the doctor marked
                    the day as a holiday. It can no longer be rescheduled.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => closeReschedule()}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
                <>
              <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
                {rescheduleStep === "pick"
                  ? `Choose a new slot for ${rescheduleTarget.patientName} with ${formatDoctorDisplayName(rescheduleTarget.doctor.name)}. Only ${rescheduleTarget.durationMinutes}-minute slots are shown. ${RESCHEDULE_ONLY_MORE_THAN_24H}`
                  : selectedSlot
                    ? slotTzView === "patient"
                      ? `Move this appointment to ${formatDateInPatientTz(selectedSlot.doctorDate, selectedSlot.startTime, doctorTz, rescheduleTarget.patientTimezone)} at ${formatTimeInPatientTz(selectedSlot.doctorDate, selectedSlot.startTime, doctorTz, rescheduleTarget.patientTimezone)} (${rescheduleTarget.patientTimezone})?`
                      : `Move this appointment to ${formatDateInDoctorTz(selectedSlot.doctorDate, selectedSlot.startTime, doctorTz)} at ${formatTimeInDoctorTz(selectedSlot.doctorDate, selectedSlot.startTime, doctorTz)} (${doctorTz})?`
                    : ""}
              </p>

              <p className="mt-3 rounded-lg bg-[#f4f7ff] px-4 py-3 font-montserrat text-sm text-[#333333]">
                Original appointment: {rescheduleTarget.durationMinutes}-minute{" "}
                {consultationTypeLabel(rescheduleTarget.consultationType)} consultation.
                Only slots matching this duration and consultation type are shown.
              </p>

              {rescheduleStep === "pick" && (
                <div className="mt-6 flex flex-col gap-6">
                  <div>
                    <label className="font-montaga text-base font-semibold text-[#333333]">
                      Date
                    </label>
                    <div className="mt-2">
                      {availabilityCalendarInitialLoading ? (
                        <Skeleton className="h-[340px] w-full max-w-sm rounded-xl bg-[#e5e5e5]" />
                      ) : enabledDateSet.size === 0 ? (
                        <p className="font-montserrat text-sm text-[#5E5E5E]">
                          No upcoming slots are available to reschedule to yet.
                        </p>
                      ) : (
                        <>
                          <SetAvailabilityCalendar
                            value={selectedDate}
                            minDate={rescheduleMinDate}
                            disabledDates={new Set()}
                            enabledDates={enabledDateSet}
                            loadingDisabledDates={false}
                            gridAriaLabel="Select reschedule date"
                            onViewingMonthChange={onRescheduleCalendarViewingMonthChange}
                            onSelect={onRescheduleCalendarSelect}
                          />
                          {availabilityCalendarExtending ? (
                            <p className="mt-2 font-montserrat text-xs text-[#5E5E5E]">
                              Loading more dates…
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-montaga text-base font-semibold text-[#333333]">
                        Available times
                      </h3>
                      <div
                        role="group"
                        aria-label="Slot timezone view"
                        className="inline-flex overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
                      >
                        <button
                          type="button"
                          onClick={() => setSlotTzView("doctor")}
                          className={`cursor-pointer px-3 py-1.5 font-montserrat text-xs transition-colors ${
                            slotTzView === "doctor"
                              ? "bg-[#2555F3] text-white"
                              : "bg-white text-[#333333] hover:bg-[#fafafa]"
                          }`}
                        >
                          Doctor TZ
                        </button>
                        <button
                          type="button"
                          onClick={() => setSlotTzView("patient")}
                          className={`cursor-pointer px-3 py-1.5 font-montserrat text-xs transition-colors ${
                            slotTzView === "patient"
                              ? "bg-[#2555F3] text-white"
                              : "bg-white text-[#333333] hover:bg-[#fafafa]"
                          }`}
                        >
                          Patient TZ
                        </button>
                      </div>
                    </div>
                    {!slotsInitialLoading && (
                      <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
                        {rescheduleTarget.durationMinutes}-minute slots only ·{" "}
                        {slotTzView === "patient"
                          ? rescheduleTarget.patientTimezone
                          : doctorTz}
                      </p>
                    )}
                    {slotsBackgroundFetching ? (
                      <p
                        className="mt-2 font-montserrat text-xs text-[#5E5E5E]"
                        aria-live="polite"
                      >
                        Updating times…
                      </p>
                    ) : null}
                    {slotsInitialLoading && (
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Skeleton key={i} className="h-11 w-full rounded-xl bg-[#e5e5e5]" />
                        ))}
                      </div>
                    )}
                    {!slotsInitialLoading && !hasSelectableSlots && (
                      <p className="mt-4 font-montserrat text-sm text-[#5E5E5E]">
                        No slots available for this date.
                      </p>
                    )}
                    {!slotsInitialLoading && filteredSlots.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {filteredSlots.map((ref) => {
                          const isCurrent =
                            ref.startTime === rescheduleTarget.time &&
                            ref.doctorDate === rescheduleTarget.date;
                          return (
                            <Button
                              key={`${ref.doctorDate}:${ref.startTime}`}
                              type="button"
                              variant={
                                selectedSlot?.startTime === ref.startTime &&
                                selectedSlot?.doctorDate === ref.doctorDate
                                  ? "default"
                                  : "outline"
                              }
                              disabled={isCurrent}
                              aria-disabled={isCurrent}
                              title={isCurrent ? "Current Slot" : undefined}
                              className={`h-11 rounded-xl font-montserrat text-sm ${
                                isCurrent
                                  ? "cursor-not-allowed opacity-60"
                                  : "cursor-pointer"
                              }`}
                              onClick={() => {
                                if (isCurrent) return;
                                setHasSelectionInteraction(true);
                                setSelectedSlot({
                                  doctorDate: ref.doctorDate,
                                  startTime: ref.startTime,
                                });
                                setRescheduleError(null);
                              }}
                            >
                              <span className="inline-flex flex-col items-center leading-tight">
                                <span>
                                  {slotTzView === "patient"
                                    ? formatTimeInPatientTz(
                                        ref.doctorDate,
                                        ref.startTime,
                                        doctorTz,
                                        rescheduleTarget.patientTimezone,
                                      )
                                    : formatTimeInDoctorTz(
                                        ref.doctorDate,
                                        ref.startTime,
                                        doctorTz,
                                      )}
                                </span>
                                {isCurrent ? (
                                  <span className="text-[10px] uppercase tracking-wide">
                                    Current
                                  </span>
                                ) : null}
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {shouldBlockCurrentAppointmentSlot && (
                    <p className="font-montserrat text-sm text-[#5E5E5E]">
                      This is the current slot — pick a different time to reschedule.
                    </p>
                  )}
                  {rescheduleError && (
                    <p className="font-montserrat text-sm text-red-600">{rescheduleError}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => closeReschedule()}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={
                        !selectedDate ||
                        !selectedSlot ||
                        isCurrentAppointmentSlot ||
                        shouldBlockCurrentAppointmentSlot
                      }
                      className="cursor-pointer disabled:cursor-not-allowed"
                      onClick={() => setRescheduleStep("confirm")}
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {rescheduleStep === "confirm" && (
                <div className="mt-6 flex flex-col gap-4">
                  {rescheduleError && (
                    <p className="font-montserrat text-sm text-red-600">{rescheduleError}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={rescheduleSubmitting}
                      className="cursor-pointer disabled:cursor-not-allowed"
                      onClick={() => {
                        setRescheduleStep("pick");
                        setRescheduleError(null);
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      disabled={rescheduleSubmitting}
                      className="cursor-pointer disabled:cursor-not-allowed"
                      onClick={() => void submitAdminReschedule()}
                    >
                      {rescheduleSubmitting ? "Rescheduling…" : "Confirm reschedule"}
                    </Button>
                  </div>
                </div>
              )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
