"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { QuickCheckStyleDateField } from "@/components/QuickCheckStyleDateField";
import { Skeleton } from "@/components/ui/skeleton";
import { SELECT_CHEVRON } from "@/lib/select-styles";
import { cn } from "@/lib/utils";
import { useDoctorAppointmentsPusher } from "@/lib/use-doctor-appointments-pusher";
import { useDoctorSlotsPusher } from "@/lib/use-doctor-slots-pusher";
import {
  ScheduleDaySlotSummary,
  SlotSummaryFromDetails,
  type ScheduleListDay as ListDay,
  type SlotDetail,
} from "./scheduleDaySlots";

const ALL_MONTHS_VALUE = "__all_months__";

function formatScheduleDayHeading(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const currentY = new Date().getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(y !== currentY ? { year: "numeric" as const } : {}),
  }).format(dt);
}

function uniqueSortedMonths(dayRows: ListDay[]): string[] {
  const set = new Set<string>();
  for (const d of dayRows) {
    set.add(d.date.slice(0, 7));
  }
  return [...set].sort();
}

function sortedDatesInMonth(dayRows: ListDay[], monthYm: string): string[] {
  const set = new Set<string>();
  for (const d of dayRows) {
    if (d.date.slice(0, 7) === monthYm) set.add(d.date);
  }
  return [...set].sort();
}

function formatMonthOptionLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(dt);
}

function scheduleFilterSelectClassName(className?: string) {
  return cn(
    "w-full min-w-0 cursor-pointer rounded-xl border border-[#e5e5e5] bg-white py-2 pl-3 pr-10 font-montserrat text-sm text-[#111111] shadow-sm [color-scheme:light] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20",
    SELECT_CHEVRON,
    className,
  );
}

const SCHEDULE_READONLY_NOTE =
  "Schedule changes are disabled while your account is deactivated.";

function ScheduleDayActionButtons({
  isoDate,
  onEditDate,
  onMarkHolidayClick,
  clearingDate,
  scheduleReadOnly,
  todayFromApi,
}: {
  isoDate: string;
  onEditDate: (isoDate: string) => void;
  onMarkHolidayClick: (isoDate: string) => void;
  clearingDate: string | null;
  scheduleReadOnly: boolean;
  todayFromApi: string | null;
}) {
  const isHolidayBlocked =
    scheduleReadOnly || (!!todayFromApi && isoDate <= todayFromApi);
  const holidayBlockedTitle = scheduleReadOnly
    ? SCHEDULE_READONLY_NOTE
    : isHolidayBlocked
      ? "Cannot mark a day in progress as a holiday"
      : undefined;

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <button
        type="button"
        disabled={scheduleReadOnly}
        title={scheduleReadOnly ? SCHEDULE_READONLY_NOTE : undefined}
        onClick={() => onEditDate(isoDate)}
        className={cn(
          "cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 font-montserrat text-xs font-medium text-[#2555F3] transition-colors",
          "hover:bg-[#f5f8ff]",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white",
        )}
      >
        Edit
      </button>
      <span title={holidayBlockedTitle} className="inline-flex">
        <button
          type="button"
          disabled={clearingDate === isoDate || isHolidayBlocked}
          onClick={() => onMarkHolidayClick(isoDate)}
          className={cn(
            "cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 font-montserrat text-xs font-medium text-[#333333] transition-colors",
            "hover:bg-[#fef2f2] hover:text-red-700 hover:border-red-200",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {clearingDate === isoDate ? "Removing…" : "Mark Holiday"}
        </button>
      </span>
    </div>
  );
}

function ViewScheduleQuickCheckResults({
  quickCheckDate,
  quickCheckSlotDetails,
  quickCheckLoading,
  quickCheckError,
  onEditDate,
  onMarkHolidayClick,
  clearingDate,
  scheduleReadOnly,
  todayFromApi,
}: {
  quickCheckDate: string;
  quickCheckSlotDetails: SlotDetail[] | null;
  quickCheckLoading: boolean;
  quickCheckError: string | null;
  onEditDate: (isoDate: string) => void;
  onMarkHolidayClick: (isoDate: string) => void;
  clearingDate: string | null;
  scheduleReadOnly: boolean;
  todayFromApi: string | null;
}) {
  const d = quickCheckDate.trim();
  if (!d) return null;
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 font-montserrat text-sm text-[#333333]">
        {quickCheckLoading ? (
          <Skeleton className="h-4 w-full max-w-md" />
        ) : quickCheckError ? (
          <span className="text-red-600">{quickCheckError}</span>
        ) : quickCheckSlotDetails && quickCheckSlotDetails.length > 0 ? (
          <>
            <p className="font-semibold">{formatScheduleDayHeading(d)}</p>
            <SlotSummaryFromDetails slots={quickCheckSlotDetails} />
          </>
        ) : (
          <span className="text-[#5E5E5E]">
            No availability set for {formatScheduleDayHeading(d)}
          </span>
        )}
      </div>
      {!quickCheckLoading &&
      quickCheckSlotDetails &&
      quickCheckSlotDetails.length > 0 ? (
        <ScheduleDayActionButtons
          isoDate={d}
          onEditDate={onEditDate}
          onMarkHolidayClick={onMarkHolidayClick}
          clearingDate={clearingDate}
          scheduleReadOnly={scheduleReadOnly}
          todayFromApi={todayFromApi}
        />
      ) : null}
    </div>
  );
}

function ViewScheduleFilterHeader({
  timezone,
  hasActiveFilters,
  onClearAllFilters,
}: {
  timezone: string;
  hasActiveFilters: boolean;
  onClearAllFilters: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-montserrat text-xs text-[#5E5E5E]">
        Times shown in your clinic timezone ({timezone}). Only dates with at
        least one slot are listed.
      </p>
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={onClearAllFilters}
          className="cursor-pointer font-montserrat text-xs text-[#777777] underline underline-offset-4 transition hover:text-[#2555F3]"
        >
          Clear all filters
        </button>
      ) : null}
    </div>
  );
}

type ViewSchedulePanelProps = {
  doctorId: string;
  timezone: string;
  onEditDate: (isoDate: string) => void;
  /** Parent bumps after a successful Set-tab save so the list refetches; not tied to Set date picker. */
  listRefreshVersion: number;
  /**
   * Notifies the parent (`MyScheduleClient`) whenever availability is mutated
   * here (e.g. the doctor marks a holiday) so the parent's
   * `existingAvailabilityDates` set — which drives the disabled dates on the
   * Set Availability calendar — reloads immediately, no page refresh required.
   */
  onAvailabilityChanged?: (changedDate?: string) => void;
  scheduleReadOnly?: boolean;
};

export function ViewSchedulePanel({
  doctorId,
  timezone,
  onEditDate,
  listRefreshVersion,
  onAvailabilityChanged,
  scheduleReadOnly = false,
}: ViewSchedulePanelProps) {
  const [days, setDays] = useState<ListDay[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isListLoading, setIsListLoading] = useState(false);
  const [todayFromApi, setTodayFromApi] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearingDate, setClearingDate] = useState<string | null>(null);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [holidayConfirmDate, setHolidayConfirmDate] = useState<string | null>(
    null,
  );
  const [holidayCancelCount, setHolidayCancelCount] = useState<number | null>(
    null,
  );
  const [holidayCancelBreakdown, setHolidayCancelBreakdown] = useState<{
    inClinic: number;
    online: number;
  } | null>(null);
  const [holidayCancelCountLoading, setHolidayCancelCountLoading] =
    useState(false);
  const [holidayCancelCountError, setHolidayCancelCountError] = useState<
    string | null
  >(null);
  const [mounted, setMounted] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState<
    typeof ALL_MONTHS_VALUE | string
  >(ALL_MONTHS_VALUE);
  const [selectedDateFilter, setSelectedDateFilter] = useState<"all" | string>(
    "all",
  );
  /**
   * "Booked only" filter — when on, the list narrows to days that have at
   * least one booked slot (within whatever month/date scope is selected) and
   * each day's summary collapses to just the Booked line. Combines naturally
   * with the existing month/date filters.
   */
  const [bookedOnly, setBookedOnly] = useState(false);
  const [scheduleMonthsWithAvailability, setScheduleMonthsWithAvailability] =
    useState<string[]>([]);
  const [scheduleDatesByMonth, setScheduleDatesByMonth] = useState<
    Record<string, string[]>
  >({});

  const quickCheckInputRef = useRef<HTMLInputElement>(null);
  const latestListRequestIdRef = useRef(0);
  /** Number of list pages currently loaded, so a silent refresh can re-fetch them all. */
  const loadedPageRef = useRef(1);
  /** Latest filters mirrored for the stable Pusher refresh callback. */
  const listFiltersRef = useRef({
    selectedMonth: ALL_MONTHS_VALUE as typeof ALL_MONTHS_VALUE | string,
    bookedOnly: false,
    selectedDateFilter: "all" as "all" | string,
  });
  /** Skip live refresh while a holiday confirm/clear is in flight. */
  const blockRefreshRef = useRef(false);
  const [quickCheckDate, setQuickCheckDate] = useState("");
  const [quickCheckSlotDetails, setQuickCheckSlotDetails] = useState<
    SlotDetail[] | null
  >(null);
  const [quickCheckLoading, setQuickCheckLoading] = useState(false);
  const [quickCheckError, setQuickCheckError] = useState<string | null>(null);
  const quickCheckDateRef = useRef(quickCheckDate);
  quickCheckDateRef.current = quickCheckDate;
  const latestQuickCheckRequestIdRef = useRef(0);

  const fetchQuickCheckSlotDetails = useCallback(async (d: string) => {
    const res = await fetch(
      `/api/doctor/availability?date=${encodeURIComponent(d)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Could not load");
    }
    const data = (await res.json()) as {
      slotDetails?: {
        startTime: string;
        consultationType: SlotDetail["consultationType"];
        booked: boolean;
        slotDurationMinutes?: number;
      }[];
      slotDurationMinutes?: number;
    };
    const raw = Array.isArray(data.slotDetails) ? data.slotDetails : [];
    return raw.map((s) => ({
      startTime: s.startTime,
      consultationType: s.consultationType,
      booked: Boolean(s.booked),
      slotDurationMinutes:
        s.slotDurationMinutes ?? data.slotDurationMinutes ?? 30,
    }));
  }, []);

  /**
   * Silent background refresh (Pusher). Keeps current slot details visible while
   * fetching — no skeleton — matching `refreshLoadedPages` for the list.
   */
  const refreshQuickCheckSilently = useCallback(async () => {
    const d = quickCheckDateRef.current.trim();
    if (!d) return;
    const requestId = ++latestQuickCheckRequestIdRef.current;
    try {
      const slots = await fetchQuickCheckSlotDetails(d);
      if (latestQuickCheckRequestIdRef.current !== requestId) return;
      setQuickCheckSlotDetails(slots);
      setQuickCheckError(null);
    } catch {
      // Silent background refresh — keep stale data visible.
    }
  }, [fetchQuickCheckSlotDetails]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const d = quickCheckDate.trim();
    if (!d) {
      setQuickCheckSlotDetails(null);
      setQuickCheckError(null);
      setQuickCheckLoading(false);
      return;
    }
    const requestId = ++latestQuickCheckRequestIdRef.current;
    void (async () => {
      setQuickCheckLoading(true);
      setQuickCheckError(null);
      try {
        const slots = await fetchQuickCheckSlotDetails(d);
        if (cancelled || latestQuickCheckRequestIdRef.current !== requestId) {
          return;
        }
        setQuickCheckSlotDetails(slots);
      } catch (e) {
        if (cancelled || latestQuickCheckRequestIdRef.current !== requestId) {
          return;
        }
        setQuickCheckError(e instanceof Error ? e.message : "Could not load");
        setQuickCheckSlotDetails(null);
      } finally {
        if (
          !cancelled &&
          latestQuickCheckRequestIdRef.current === requestId
        ) {
          setQuickCheckLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quickCheckDate, listRefreshVersion, fetchQuickCheckSlotDetails]);

  const loadList = useCallback(
    async (
      nextPage: number,
      append: boolean,
      monthFilter: typeof ALL_MONTHS_VALUE | string,
      bookedOnlyFilter: boolean,
      dateFilter: "all" | string,
    ) => {
      const requestId = ++latestListRequestIdRef.current;
      setIsListLoading(true);
      if (!append) {
        setDays((current) => (current !== null ? [] : current));
        setHasMore(false);
      }
      const params = new URLSearchParams({
        view: "list",
        page: String(nextPage),
        limit: "10",
      });
      if (monthFilter !== ALL_MONTHS_VALUE) {
        params.set("month", monthFilter);
      }
      if (bookedOnlyFilter) {
        params.set("bookedOnly", "true");
      }
      if (dateFilter !== "all") {
        params.set("date", dateFilter);
      }
      const res = await fetch(`/api/doctor/availability?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (latestListRequestIdRef.current !== requestId) return;
        setIsListLoading(false);
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load schedule");
      }
      const data = (await res.json()) as {
        days: ListDay[];
        today: string;
        hasMore?: boolean;
        page?: number;
        monthsWithAvailability?: string[];
        datesByMonth?: Record<string, string[]>;
      };
      if (latestListRequestIdRef.current !== requestId) return;
      const nextDays = Array.isArray(data.days) ? data.days : [];
      setTodayFromApi(data.today);
      setScheduleMonthsWithAvailability(
        Array.isArray(data.monthsWithAvailability)
          ? data.monthsWithAvailability
          : [],
      );
      setScheduleDatesByMonth(
        data.datesByMonth && typeof data.datesByMonth === "object"
          ? data.datesByMonth
          : {},
      );
      setDays((current) =>
        append ? [...(current ?? []), ...nextDays] : nextDays,
      );
      setHasMore(Boolean(data.hasMore));
      const resolvedPage = typeof data.page === "number" ? data.page : nextPage;
      setPage(resolvedPage);
      loadedPageRef.current = resolvedPage;
      setError(null);
      setIsListLoading(false);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadList(1, false, selectedMonth, bookedOnly, selectedDateFilter);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList, selectedMonth, bookedOnly, selectedDateFilter]);

  listFiltersRef.current = { selectedMonth, bookedOnly, selectedDateFilter };
  blockRefreshRef.current = holidayConfirmDate !== null || clearingDate !== null;

  const fetchListPageRaw = useCallback(
    async (
      nextPage: number,
      monthFilter: typeof ALL_MONTHS_VALUE | string,
      bookedOnlyFilter: boolean,
      dateFilter: "all" | string,
    ) => {
      const params = new URLSearchParams({
        view: "list",
        page: String(nextPage),
        limit: "10",
      });
      if (monthFilter !== ALL_MONTHS_VALUE) params.set("month", monthFilter);
      if (bookedOnlyFilter) params.set("bookedOnly", "true");
      if (dateFilter !== "all") params.set("date", dateFilter);
      const res = await fetch(`/api/doctor/availability?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load schedule");
      return (await res.json()) as {
        days: ListDay[];
        today: string;
        hasMore?: boolean;
        page?: number;
        monthsWithAvailability?: string[];
        datesByMonth?: Record<string, string[]>;
      };
    },
    [],
  );

  /**
   * Silent refresh of all loaded list pages (preserves scroll). Used by the
   * Pusher subscription so patient bookings/cancellations reflect live without
   * a manual reload and without the loading skeleton.
   */
  const refreshLoadedPages = useCallback(async () => {
    const { selectedMonth, bookedOnly, selectedDateFilter } =
      listFiltersRef.current;
    const pagesToLoad = Math.max(1, loadedPageRef.current);
    const requestId = ++latestListRequestIdRef.current;
    try {
      const results = await Promise.all(
        Array.from({ length: pagesToLoad }, (_, i) =>
          fetchListPageRaw(i + 1, selectedMonth, bookedOnly, selectedDateFilter),
        ),
      );
      if (latestListRequestIdRef.current !== requestId) return;
      const mergedDays = results.flatMap((r) =>
        Array.isArray(r.days) ? r.days : [],
      );
      const last = results[results.length - 1];
      const savedScrollY = window.scrollY;
      setTodayFromApi(last?.today ?? null);
      setScheduleMonthsWithAvailability(
        Array.isArray(last?.monthsWithAvailability)
          ? last!.monthsWithAvailability!
          : [],
      );
      setScheduleDatesByMonth(
        last?.datesByMonth && typeof last.datesByMonth === "object"
          ? last.datesByMonth
          : {},
      );
      setDays(mergedDays);
      setHasMore(Boolean(last?.hasMore));
      requestAnimationFrame(() => {
        if (latestListRequestIdRef.current !== requestId) return;
        window.scrollTo({ top: savedScrollY, behavior: "instant" });
      });
    } catch {
      // Silent background refresh — no error banner.
    }
  }, [fetchListPageRaw]);

  const listRefreshVersionRef = useRef(listRefreshVersion);
  useEffect(() => {
    if (listRefreshVersion === listRefreshVersionRef.current) return;
    listRefreshVersionRef.current = listRefreshVersion;
    if (days === null) return;
    void refreshLoadedPages();
  }, [listRefreshVersion, refreshLoadedPages, days]);

  const onAppointmentsChanged = useCallback(() => {
    if (blockRefreshRef.current) return;
    void refreshLoadedPages();
    void refreshQuickCheckSilently();
  }, [refreshLoadedPages, refreshQuickCheckSilently]);

  useDoctorAppointmentsPusher({
    doctorId,
    enabled: !!doctorId,
    onAppointmentsChanged,
  });

  const quickCheckDoctorDates = useMemo(
    () => (quickCheckDate.trim() ? [quickCheckDate.trim()] : []),
    [quickCheckDate],
  );

  useDoctorSlotsPusher({
    doctorId,
    enabled: !!doctorId,
    queryKeys: {
      slots: ["view-schedule-quick-check-slots-noop"],
      availableDates: ["view-schedule-quick-check-dates-noop"],
    },
    currentDoctorDates: quickCheckDoctorDates,
    onSlotUpdated: (payload) => {
      if (blockRefreshRef.current) return;
      const d = quickCheckDateRef.current.trim();
      if (d && payload.date === d) {
        void refreshQuickCheckSilently();
      }
    },
  });

  /** Single-date view is short; the sentinel stays in view and would page until `hasMore` is false. */
  const allowScheduleListPagination = selectedDateFilter === "all";

  const [sentryRef] = useInfiniteScroll({
    loading: isListLoading,
    hasNextPage: hasMore && allowScheduleListPagination,
    onLoadMore: () =>
      void loadList(
        page + 1,
        true,
        selectedMonth,
        bookedOnly,
        selectedDateFilter,
      ),
    disabled: false,
    rootMargin: "0px 0px 300px 0px",
  });

  useEffect(() => {
    if (scheduleMonthsWithAvailability.length === 0) return;
    if (selectedMonth === ALL_MONTHS_VALUE) return;
    if (scheduleMonthsWithAvailability.includes(selectedMonth)) return;
    setSelectedMonth(ALL_MONTHS_VALUE);
    setSelectedDateFilter("all");
  }, [scheduleMonthsWithAvailability, selectedMonth]);

  const hasUpcomingAvailability = scheduleMonthsWithAvailability.length > 0;

  const hasActiveFilters =
    selectedMonth !== ALL_MONTHS_VALUE ||
    selectedDateFilter !== "all" ||
    bookedOnly ||
    quickCheckDate.trim() !== "";

  const clearAllFilters = useCallback(() => {
    setSelectedMonth(ALL_MONTHS_VALUE);
    setSelectedDateFilter("all");
    setBookedOnly(false);
    setQuickCheckDate("");
  }, []);

  const monthOptions = useMemo(() => {
    if (scheduleMonthsWithAvailability.length > 0) {
      return scheduleMonthsWithAvailability;
    }
    if (!days?.length) return [];
    return uniqueSortedMonths(days);
  }, [scheduleMonthsWithAvailability, days]);

  const dateOptionsInMonth = useMemo(() => {
    if (selectedMonth === ALL_MONTHS_VALUE) {
      if (Object.keys(scheduleDatesByMonth).length > 0) {
        return Object.values(scheduleDatesByMonth)
          .flat()
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      }
      return [...(days ?? []).map((d) => d.date)].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
    }
    const fromMeta = scheduleDatesByMonth[selectedMonth];
    if (fromMeta?.length) return fromMeta;
    return sortedDatesInMonth(days ?? [], selectedMonth);
  }, [days, selectedMonth, scheduleDatesByMonth]);

  const filteredDays = days ?? [];

  useEffect(() => {
    if (!holidayConfirmDate) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHolidayConfirmDate(null);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [holidayConfirmDate]);

  useEffect(() => {
    let cancelled = false;
    if (!holidayConfirmDate) {
      setHolidayCancelCount(null);
      setHolidayCancelBreakdown(null);
      setHolidayCancelCountError(null);
      setHolidayCancelCountLoading(false);
      return;
    }
    void (async () => {
      setHolidayCancelCountLoading(true);
      setHolidayCancelCountError(null);
      setHolidayCancelCount(null);
      setHolidayCancelBreakdown(null);
      try {
        const res = await fetch(
          `/api/doctor/availability?date=${encodeURIComponent(holidayConfirmDate)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Could not load appointment count");
        }
        const data = (await res.json()) as {
          bookedSlotStarts?: string[];
          bookedAppointmentsByType?: { inClinic?: number; online?: number };
        };
        if (!cancelled) {
          const count = Array.isArray(data.bookedSlotStarts)
            ? data.bookedSlotStarts.length
            : 0;
          setHolidayCancelCount(count);
          setHolidayCancelBreakdown({
            inClinic: data.bookedAppointmentsByType?.inClinic ?? 0,
            online: data.bookedAppointmentsByType?.online ?? 0,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setHolidayCancelCountError(
            e instanceof Error ? e.message : "Could not load appointment count",
          );
        }
      } finally {
        if (!cancelled) setHolidayCancelCountLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [holidayConfirmDate]);

  async function executeMarkHoliday(isoDate: string) {
    setHolidayError(null);
    setClearingDate(isoDate);
    setHolidayConfirmDate(null);
    try {
      const res = await fetch("/api/doctor/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "single",
          singleDate: isoDate,
          slotStarts: [],
          clearDay: true,
        }),
      });
      const text = await res.text();
      let data: { error?: string } = {};
      if (text) {
        try {
          data = JSON.parse(text) as { error?: string };
        } catch {
          throw new Error(
            res.status === 504
              ? "Request timed out. Refresh your schedule to check status."
              : "Could not update",
          );
        }
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Could not update");
      }
      await refreshLoadedPages();
      onAvailabilityChanged?.(isoDate);
      if (isoDate === quickCheckDate.trim()) {
        setQuickCheckDate("");
      }
    } catch (e) {
      setHolidayError(
        e instanceof Error ? e.message : "Could not mark holiday",
      );
    } finally {
      setClearingDate(null);
    }
  }

  const holidayModal =
    mounted &&
    holidayConfirmDate &&
    createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="holiday-modal-title"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default bg-black/40"
          aria-label="Close dialog"
          onClick={() => setHolidayConfirmDate(null)}
        />
        <div
          className="relative z-[1] w-full max-w-md rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="holiday-modal-title"
            className="font-montaga text-xl font-semibold text-[#333333]"
          >
            Mark holiday?
          </h2>
          <p className="mt-3 font-montserrat text-sm leading-relaxed text-[#5E5E5E]">
            Remove all availability for{" "}
            <span className="font-medium text-[#333333]">
              {formatScheduleDayHeading(holidayConfirmDate)}
            </span>
            ?{" "}
            {holidayCancelCountLoading ? (
              <span>Checking appointments to cancel...</span>
            ) : holidayCancelCountError ? (
              <span>
                Could not load cancellation count right now. Confirmed and
                pending appointments for this date will still be cancelled.
              </span>
            ) : (
              <span>
                <span className="font-medium text-red-600">
                  {holidayCancelCount ?? 0}{" "}
                  {(holidayCancelCount ?? 0) === 1
                    ? "appointment"
                    : "appointments"}
                </span>{" "}
                will be cancelled.
                {(holidayCancelBreakdown?.inClinic ?? 0) +
                  (holidayCancelBreakdown?.online ?? 0) >
                0 ? (
                  <>
                    {" "}
                    (
                    <span className="font-medium text-[#333333]">
                      {holidayCancelBreakdown?.inClinic ?? 0} in-clinic
                    </span>
                    ,{" "}
                    <span className="font-medium text-[#333333]">
                      {holidayCancelBreakdown?.online ?? 0} online
                    </span>
                    )
                  </>
                ) : null}
              </span>
            )}{" "}
            Paid online bookings will be fully refunded, and patients will be
            notified.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              className="cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-4 py-2.5 font-montserrat text-sm font-medium text-[#333333] transition-colors hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={holidayCancelCountLoading}
              onClick={() => setHolidayConfirmDate(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-xl bg-[#dc2626] px-4 py-2.5 font-montserrat text-sm font-medium text-white transition-colors hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void executeMarkHoliday(holidayConfirmDate)}
              disabled={holidayCancelCountLoading}
            >
              Remove availability
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  if (error) {
    return <p className="mt-6 font-montserrat text-sm text-red-600">{error}</p>;
  }

  if (days === null) {
    return (
      <div
        className="mt-6 space-y-4"
        aria-busy="true"
        aria-label="Loading schedule"
      >
        <div className="space-y-2">
          <Skeleton className="h-3 w-full max-w-md" />
          <Skeleton className="h-3 w-full max-w-lg" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full max-w-[min(100%,14rem)]">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="mt-1.5 h-11 w-full rounded-xl" />
          </div>
          <div className="w-full max-w-[min(100%,14rem)]">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="mt-1.5 h-11 w-full rounded-xl" />
          </div>
          <div className="w-full max-w-[min(100%,14rem)]">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-1.5 h-11 w-full rounded-xl" />
          </div>
        </div>
        <ul className="space-y-3">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="flex flex-col gap-3 rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-full max-w-sm" />
              </div>
              <div className="flex shrink-0 gap-2">
                <Skeleton className="h-8 w-14 rounded-lg" />
                <Skeleton className="h-8 w-28 rounded-lg" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (days.length === 0 && !hasUpcomingAvailability) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-8 text-center">
          <p className="font-montserrat text-sm text-[#5E5E5E]">
            No upcoming availability.
            {scheduleReadOnly ? (
              <> View your schedule below when slots are added.</>
            ) : (
              <>
                {" "}
                Use{" "}
                <span className="font-medium text-[#333333]">
                  Set Availability
                </span>{" "}
                to add slots.
              </>
            )}
          </p>
        </div>
        {todayFromApi ? (
          <div className="space-y-3">
            <ViewScheduleFilterHeader
              timezone={timezone}
              hasActiveFilters={hasActiveFilters}
              onClearAllFilters={clearAllFilters}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <QuickCheckStyleDateField
                id="view-schedule-quick-check"
                label="Quick check"
                minDate={todayFromApi}
                inputRef={quickCheckInputRef}
                value={quickCheckDate}
                onChange={setQuickCheckDate}
                clearLabel="Clear quick check"
                clearAriaLabel="Clear quick check only"
                ariaLabel="Pick a date to view saved slots"
              />
            </div>
            <ViewScheduleQuickCheckResults
              quickCheckDate={quickCheckDate}
              quickCheckSlotDetails={quickCheckSlotDetails}
              quickCheckLoading={quickCheckLoading}
              quickCheckError={quickCheckError}
              onEditDate={onEditDate}
              onMarkHolidayClick={setHolidayConfirmDate}
              clearingDate={clearingDate}
              scheduleReadOnly={scheduleReadOnly}
              todayFromApi={todayFromApi}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {scheduleReadOnly ? (
        <p
          role="status"
          className="rounded-xl border border-[#ffd9d9] bg-[#fff1f1] px-4 py-3 font-montserrat text-sm text-[#b42318]"
        >
          {SCHEDULE_READONLY_NOTE}
        </p>
      ) : null}
      {todayFromApi ? (
        <div className="space-y-3">
          <ViewScheduleFilterHeader
            timezone={timezone}
            hasActiveFilters={hasActiveFilters}
            onClearAllFilters={clearAllFilters}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            {monthOptions.length > 0 ? (
              <>
                <div className="w-full max-w-[min(100%,14rem)]">
                  <label
                    htmlFor="view-schedule-month"
                    className="block font-montserrat text-xs font-medium text-[#5E5E5E]"
                  >
                    Month
                  </label>
                  <select
                    id="view-schedule-month"
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      setSelectedDateFilter("all");
                    }}
                    className={scheduleFilterSelectClassName("mt-1.5")}
                  >
                    <option value={ALL_MONTHS_VALUE}>All months</option>
                    {monthOptions.map((ym) => (
                      <option key={ym} value={ym}>
                        {formatMonthOptionLabel(ym)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-full max-w-[min(100%,14rem)]">
                  <label
                    htmlFor="view-schedule-date"
                    className="block font-montserrat text-xs font-medium text-[#5E5E5E]"
                  >
                    Date
                  </label>
                  <select
                    id="view-schedule-date"
                    value={selectedDateFilter}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedDateFilter(v === "all" ? "all" : v);
                    }}
                    className={scheduleFilterSelectClassName("mt-1.5")}
                  >
                    <option value="all">All dates</option>
                    {dateOptionsInMonth.map((iso) => (
                      <option key={iso} value={iso}>
                        {formatScheduleDayHeading(iso)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
            <QuickCheckStyleDateField
              id="view-schedule-quick-check"
              label="Quick check"
              minDate={todayFromApi}
              inputRef={quickCheckInputRef}
              value={quickCheckDate}
              onChange={setQuickCheckDate}
              clearLabel="Clear quick check"
              clearAriaLabel="Clear quick check only"
              ariaLabel="Pick a date to view saved slots"
            />
            <div className="flex items-end">
              <button
                type="button"
                role="switch"
                aria-checked={bookedOnly}
                onClick={() => setBookedOnly((v) => !v)}
                className={cn(
                  "cursor-pointer rounded-xl border px-4 py-2.5 font-montserrat text-sm font-medium transition-colors",
                  bookedOnly
                    ? "border-[#2555F3] bg-[#2555F3] text-white hover:bg-[#1e44c7]"
                    : "border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#f5f5f5]",
                )}
                title="Show only days with booked slots, scoped to the selected month/date."
              >
                Booked only
              </button>
            </div>
          </div>
          <ViewScheduleQuickCheckResults
            quickCheckDate={quickCheckDate}
            quickCheckSlotDetails={quickCheckSlotDetails}
            quickCheckLoading={quickCheckLoading}
            quickCheckError={quickCheckError}
            onEditDate={onEditDate}
            onMarkHolidayClick={setHolidayConfirmDate}
            clearingDate={clearingDate}
            scheduleReadOnly={scheduleReadOnly}
            todayFromApi={todayFromApi}
          />
        </div>
      ) : null}

      {bookedOnly ? (
        <p className="font-montserrat text-xs text-[#5E5E5E]">
          Showing booked slots only
          {selectedDateFilter !== "all"
            ? ` for ${formatScheduleDayHeading(selectedDateFilter)}.`
            : selectedMonth !== ALL_MONTHS_VALUE
              ? ` for ${formatMonthOptionLabel(selectedMonth)}.`
              : " across all upcoming dates."}
        </p>
      ) : null}

      {holidayError && (
        <p className="font-montserrat text-sm text-red-600">{holidayError}</p>
      )}

      {isListLoading && filteredDays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-6 text-center">
          <p className="font-montserrat text-sm text-[#5E5E5E]">Loading...</p>
        </div>
      ) : filteredDays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-6 text-center">
          <p className="font-montserrat text-sm text-[#5E5E5E]">
            {bookedOnly
              ? "No booked slots in this selection."
              : "No availability in this selection."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredDays.map((day) => (
            <li
              key={day.date}
              className="flex flex-col gap-3 rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 font-montserrat text-sm text-[#333333]">
                <p className="font-semibold">
                  {formatScheduleDayHeading(day.date)}
                </p>
                <ScheduleDaySlotSummary day={day} bookedOnly={bookedOnly} />
              </div>
              <ScheduleDayActionButtons
                isoDate={day.date}
                onEditDate={onEditDate}
                onMarkHolidayClick={setHolidayConfirmDate}
                clearingDate={clearingDate}
                scheduleReadOnly={scheduleReadOnly}
                todayFromApi={todayFromApi}
              />
            </li>
          ))}
        </ul>
      )}
      {((hasMore && !isListLoading) ||
        (isListLoading && filteredDays.length > 0)) &&
        allowScheduleListPagination && (
        <div
          ref={sentryRef}
          className="py-2 text-center font-montserrat text-sm text-[#5E5E5E]"
        >
          {isListLoading ? "Loading..." : "Scroll for more"}
        </div>
      )}
      {holidayModal}
    </div>
  );
}
