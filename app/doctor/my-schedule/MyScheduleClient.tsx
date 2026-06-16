"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  alignWindowEndExclusiveToSlotGrid,
  alignWindowStartToSlotGrid,
  ALLOWED_SLOT_DURATION_MINUTES,
  DEFAULT_SLOT_DURATION_MINUTES,
  DEFAULT_SLOT_WINDOW_END,
  DEFAULT_SLOT_WINDOW_START,
  generateSlots,
  minutesToTime,
  slotEndFromStart,
  slotOverlapsRange,
  type AllowedSlotDurationMinutes,
} from "@/lib/doctor-availability-slots";
import { timeToMinutes } from "@/lib/time";
import {
  addOneDayYmd,
  enumerateInclusiveYmd,
  MAX_DOCTOR_AVAILABILITY_RANGE_DAYS,
} from "@/lib/doctor-local-date";
import { isDoctorTimeInPast } from "@/lib/timezone-display";
import { cn } from "@/lib/utils";
import { ViewSchedulePanel } from "./ViewSchedulePanel";
import { SetAvailabilityCalendar } from "./SetAvailabilityCalendar";
import {
  SlotSummaryDeletePicker,
  SlotSummaryFromDetails,
  type SlotDetail,
} from "./scheduleDaySlots";

type Meta = {
  timezone: string;
  today: string;
  slotDurationMinutes: AllowedSlotDurationMinutes;
};

type WindowConsultationType = "CLINIC" | "ONLINE" | "BOTH";

type ScheduleWindow = {
  id: string;
  duration: AllowedSlotDurationMinutes;
  start: string;
  end: string;
  consultationType: WindowConsultationType;
};

const WINDOW_CONSULTATION_LABEL: Record<WindowConsultationType, string> = {
  CLINIC: "Clinic",
  ONLINE: "Online",
  BOTH: "Both",
};

const RANGE_DAYS_LIMIT_ERROR =
  "You can set availability for up to 65 days at a time. For longer periods, save in smaller chunks.";

function windowsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) {
  return aStart < bEnd && bStart < aEnd;
}

function consultationTypeForSlot(
  startTime: string,
  windows: ScheduleWindow[],
): WindowConsultationType {
  for (const w of windows) {
    if (generateSlots(w.start, w.end, w.duration).includes(startTime)) {
      return w.consultationType;
    }
  }
  return "BOTH";
}

function WindowConsultationTypePicker({
  value,
  onChange,
  ariaLabel = "Consultation mode for window",
  compact = false,
}: {
  value: WindowConsultationType;
  onChange: (value: WindowConsultationType) => void;
  ariaLabel?: string;
  compact?: boolean;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex flex-wrap gap-1">
      {(["CLINIC", "ONLINE", "BOTH"] as const).map((modeValue) => (
        <button
          key={modeValue}
          type="button"
          className={cn(
            "cursor-pointer rounded-lg border font-montserrat transition-colors",
            compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs",
            value === modeValue
              ? "border-[#2555F3] bg-[#2555F3] text-white"
              : "border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#f5f5f5]",
          )}
          onClick={() => onChange(modeValue)}
        >
          {WINDOW_CONSULTATION_LABEL[modeValue]}
        </button>
      ))}
    </div>
  );
}

function CurrentSchedulePanelSkeleton() {
  return (
    <div
      className="mt-8 rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3"
      aria-busy="true"
      aria-label="Loading current schedule"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-24 rounded-lg" />
      </div>
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <Skeleton className="mt-2 h-3 w-full max-w-sm" />
    </div>
  );
}

export function MyScheduleClient() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<"set" | "view">("set");
  const [mode, setMode] = useState<"range" | "single">("single");

  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [singleDate, setSingleDate] = useState("");

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [initialSelected, setInitialSelected] = useState<Set<string>>(
    () => new Set(),
  );
  /**
   * Slots the doctor explicitly deselected during this edit session (only ones
   * that were present in `initialSelected` count). Tracking this separately
   * from `initialSelected - selected` is required because changing the time
   * window silently prunes off-screen slots from `selected`; treating that
   * pruning as a removal would delete slots the doctor never touched.
   */
  const [explicitlyRemoved, setExplicitlyRemoved] = useState<Set<string>>(
    () => new Set(),
  );
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(() => new Set());
  const [draftWindowConsultationType, setDraftWindowConsultationType] =
    useState<WindowConsultationType>("BOTH");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [existingAvailabilityDates, setExistingAvailabilityDates] = useState<
    Set<string>
  >(() => new Set());
  const [existingAvailabilityDatesLoading, setExistingAvailabilityDatesLoading] =
    useState(true);
  const [editableDateFromView, setEditableDateFromView] = useState<string | null>(
    null,
  );
  /**
   * Slot details for the currently viewed single date — used to render the
   * read-only "current schedule" summary above the slot grid when the doctor
   * arrives via View Schedule -> Edit, so they keep full context of what's
   * already saved while they make changes.
   */
  const [currentDaySlotDetails, setCurrentDaySlotDetails] = useState<
    SlotDetail[]
  >([]);
  /** Bumps only after a successful Save so View Schedule list reloads; decoupled from Set-tab date changes. */
  const [viewScheduleListVersion, setViewScheduleListVersion] = useState(0);

  const [windows, setWindows] = useState<ScheduleWindow[]>([]);
  const [slotDurationMap, setSlotDurationMap] = useState<
    Map<string, AllowedSlotDurationMinutes>
  >(() => new Map());
  const [windowOverlapError, setWindowOverlapError] = useState<string | null>(null);
  const [builderPhase, setBuilderPhase] = useState<"idle" | "adding" | "done">("idle");

  const [deleteMode, setDeleteMode] = useState(false);
  const [slotsToDelete, setSlotsToDelete] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteOk, setDeleteOk] = useState<string | null>(null);

  const [slotWindowStart, setSlotWindowStart] = useState(
    DEFAULT_SLOT_WINDOW_START,
  );
  const [slotWindowEnd, setSlotWindowEnd] = useState(DEFAULT_SLOT_WINDOW_END);
  const [slotDurationMinutes, setSlotDurationMinutes] =
    useState<AllowedSlotDurationMinutes>(DEFAULT_SLOT_DURATION_MINUTES);

  const slotWindowStartInputRef = useRef<HTMLInputElement>(null);
  const slotWindowEndInputRef = useRef<HTMLInputElement>(null);
  /** Latest window for async fetch when the loaded day has no saved slots (keep previous window). */
  const slotWindowStartRef = useRef(DEFAULT_SLOT_WINDOW_START);
  const slotWindowEndRef = useRef(DEFAULT_SLOT_WINDOW_END);
  /** Latest slot length (matches `slotDurationMinutes`) for fetch fallback when API omits or invalidates duration. */
  const slotDurationRef = useRef<AllowedSlotDurationMinutes>(
    DEFAULT_SLOT_DURATION_MINUTES,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/doctor/availability");
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to load");
        }
        const data = (await res.json()) as Meta;
        if (!cancelled) {
          setMeta(data);
          if (
            ALLOWED_SLOT_DURATION_MINUTES.includes(
              data.slotDurationMinutes as AllowedSlotDurationMinutes,
            )
          ) {
            setSlotDurationMinutes(
              data.slotDurationMinutes as AllowedSlotDurationMinutes,
            );
          }
          const tomorrow = addOneDayYmd(data.today);
          setRangeStart(tomorrow);
          setRangeEnd(tomorrow);
          setSingleDate(data.today);
          setMetaError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setMetaError(e instanceof Error ? e.message : "Failed to load");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    async function loadExistingAvailabilityDates() {
      setExistingAvailabilityDatesLoading(true);
      try {
        const res = await fetch("/api/doctor/availability?view=dates", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { dates?: string[] };
        const collected = new Set(
          (Array.isArray(data.dates) ? data.dates : []).filter(Boolean),
        );
        if (!cancelled) setExistingAvailabilityDates(collected);
      } finally {
        if (!cancelled) setExistingAvailabilityDatesLoading(false);
      }
    }
    void loadExistingAvailabilityDates();
    return () => {
      cancelled = true;
    };
  }, [meta, viewScheduleListVersion]);

  const displaySlots = useMemo(() => {
    const all = new Set<string>();
    for (const w of windows) {
      for (const s of generateSlots(w.start, w.end, w.duration)) {
        all.add(s);
      }
    }
    return [...all].sort();
  }, [windows]);

  useEffect(() => {
    slotWindowStartRef.current = slotWindowStart;
  }, [slotWindowStart]);
  useEffect(() => {
    slotWindowEndRef.current = slotWindowEnd;
  }, [slotWindowEnd]);
  useEffect(() => {
    slotDurationRef.current = slotDurationMinutes;
  }, [slotDurationMinutes]);

  const fetchSlotsForDate = useCallback(async (date: string) => {
    setLoadingSlots(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/doctor/availability?date=${encodeURIComponent(date)}`,
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load slots");
      }
      const data = (await res.json()) as {
        slotStarts: string[];
        slotDetails?: SlotDetail[];
        consultationType?: "CLINIC" | "ONLINE" | "BOTH";
        bookedSlotStarts?: string[];
        today: string;
        timezone: string;
        slotDurationMinutes?: number;
      };
      const rawSlotDetails: SlotDetail[] = Array.isArray(data.slotDetails)
        ? data.slotDetails.map((s) => ({
            startTime: s.startTime,
            consultationType: s.consultationType,
            booked: Boolean(s.booked),
            slotDurationMinutes: s.slotDurationMinutes ?? data.slotDurationMinutes ?? 30,
          }))
        : [];
      setCurrentDaySlotDetails(rawSlotDetails);

      const rawStarts = [...data.slotStarts].sort();
      const apiDurationValid =
        data.slotDurationMinutes !== undefined &&
        ALLOWED_SLOT_DURATION_MINUTES.includes(
          data.slotDurationMinutes as AllowedSlotDurationMinutes,
        );
      const apiDuration = apiDurationValid
        ? (data.slotDurationMinutes as AllowedSlotDurationMinutes)
        : slotDurationRef.current;
      /** Empty days: API sends the doctor's global default, not a per-day save — keep the current Set-tab duration (ref). Days with saves: use inferred duration from rows. */
      const duration: AllowedSlotDurationMinutes =
        rawStarts.length > 0 ? apiDuration : slotDurationRef.current;
      let windowStart = slotWindowStartRef.current;
      let windowEnd = slotWindowEndRef.current;
      if (rawStarts.length > 0) {
        const first = rawStarts[0]!;
        const last = rawStarts[rawStarts.length - 1]!;
        const lastEndExclusive = minutesToTime(
          timeToMinutes(last) + duration,
        );
        windowStart = alignWindowStartToSlotGrid(first, duration);
        windowEnd = alignWindowEndExclusiveToSlotGrid(lastEndExclusive, duration);
        slotWindowStartRef.current = windowStart;
        slotWindowEndRef.current = windowEnd;
        setSlotWindowStart(windowStart);
        setSlotWindowEnd(windowEnd);
      } else {
        // Empty day: reset the window to the global default 09:00–24:00 so
        // every fresh date starts from the same canvas, instead of carrying
        // over whatever the previously viewed day had.
        windowStart = alignWindowStartToSlotGrid(
          DEFAULT_SLOT_WINDOW_START,
          duration,
        );
        windowEnd = alignWindowEndExclusiveToSlotGrid(
          DEFAULT_SLOT_WINDOW_END,
          duration,
        );
        slotWindowStartRef.current = windowStart;
        slotWindowEndRef.current = windowEnd;
        setSlotWindowStart(windowStart);
        setSlotWindowEnd(windowEnd);
      }

      setSlotDurationMinutes(duration);

      let starts = data.slotStarts;
      if (date === data.today) {
        starts = starts.filter(
          (t) => !isDoctorTimeInPast(date, t, data.timezone),
        );
      }
      const allowed = new Set(
        generateSlots(windowStart, windowEnd, duration),
      );
      const normalizedStarts = starts.filter((t) => allowed.has(t));
      const normalizedStartSet = new Set(normalizedStarts);
      setSelected(new Set());
      setInitialSelected(new Set(normalizedStartSet));
      setExplicitlyRemoved(new Set());
      setWindows([]);
      setSlotDurationMap(new Map());
      setBuilderPhase("idle");
      setDeleteMode(false);
      setSlotsToDelete(new Set());
      setDeleteError(null);
      setDeleteOk(null);
      const normalizedBooked = (data.bookedSlotStarts ?? []).filter((slot) =>
        allowed.has(slot),
      );
      setBookedSlots(new Set(normalizedBooked));
      if (data.consultationType) {
        setDraftWindowConsultationType(data.consultationType);
      } else {
        setDraftWindowConsultationType("BOTH");
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
      setSelected(new Set());
      setInitialSelected(new Set());
      setExplicitlyRemoved(new Set());
      setWindows([]);
      setSlotDurationMap(new Map());
      setBuilderPhase("idle");
      setBookedSlots(new Set());
      setCurrentDaySlotDetails([]);
      setDeleteMode(false);
      setSlotsToDelete(new Set());
      setDeleteError(null);
      setDeleteOk(null);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  /**
   * Refreshes persisted day details used by the "Current schedule" panel
   * without resetting in-progress edit-builder state (windows/selected/etc).
   */
  const refreshCurrentDaySlotDetailsOnly = useCallback(
    async (date: string): Promise<boolean> => {
      try {
        const res = await fetch(
          `/api/doctor/availability?date=${encodeURIComponent(date)}`,
        );
        if (!res.ok) return false;
        const data = (await res.json()) as {
          slotDetails?: SlotDetail[];
          bookedSlotStarts?: string[];
          today: string;
          timezone: string;
          slotDurationMinutes?: number;
        };
        const rawSlotDetails: SlotDetail[] = Array.isArray(data.slotDetails)
          ? data.slotDetails.map((s) => ({
              startTime: s.startTime,
              consultationType: s.consultationType,
              booked: Boolean(s.booked),
              slotDurationMinutes:
                s.slotDurationMinutes ?? data.slotDurationMinutes ?? 30,
            }))
          : [];
        setCurrentDaySlotDetails(rawSlotDetails);

        // Keep booked guards current without reinitializing edit selections/windows.
        let normalizedBooked = data.bookedSlotStarts ?? [];
        if (date === data.today) {
          normalizedBooked = normalizedBooked.filter(
            (t) => !isDoctorTimeInPast(date, t, data.timezone),
          );
        }
        setBookedSlots(new Set(normalizedBooked));
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  /** Local-only: duration is persisted on Save (PUT). Avoid PATCH so changing length here does not clobber saved-day inference or snap the dropdown back from the API. */
  const applySlotDurationForEditing = useCallback(
    (minutes: AllowedSlotDurationMinutes) => {
      setSaveOk(null);
      setWindowOverlapError(null);
      slotDurationRef.current = minutes;
      setSlotDurationMinutes(minutes);
      setSlotWindowStart((s) => alignWindowStartToSlotGrid(s, minutes));
      setSlotWindowEnd((e) => alignWindowEndExclusiveToSlotGrid(e, minutes));
    },
    [],
  );

  function addWindow() {
    if (timeToMinutes(slotWindowEnd) <= timeToMinutes(slotWindowStart)) return;
    const overlapping = windows.find((w) =>
      windowsOverlap(slotWindowStart, slotWindowEnd, w.start, w.end),
    );
    if (overlapping) {
      setWindowOverlapError(
        `This range overlaps with ${overlapping.start}\u2013${overlapping.end}. Adjust times.`,
      );
      return;
    }
    setWindowOverlapError(null);
    const slots = generateSlots(slotWindowStart, slotWindowEnd, slotDurationMinutes);
    if (slots.length === 0) return;
    const w: ScheduleWindow = {
      id: crypto.randomUUID(),
      duration: slotDurationMinutes,
      start: slotWindowStart,
      end: slotWindowEnd,
      consultationType: draftWindowConsultationType,
    };
    setWindows((prev) => [...prev, w]);
    const nextSelected = new Set(selected);
    const nextDurMap = new Map(slotDurationMap);
    for (const s of slots) {
      nextSelected.add(s);
      nextDurMap.set(s, slotDurationMinutes);
    }
    setSelected(nextSelected);
    setSlotDurationMap(nextDurMap);
    setSaveOk(null);
    setBuilderPhase("done");
    setSlotWindowStart("");
    setSlotWindowEnd("");
  }

  function updateWindowConsultationType(
    windowId: string,
    consultationType: WindowConsultationType,
  ) {
    setSaveOk(null);
    setWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, consultationType } : w)),
    );
  }

  function removeWindow(windowId: string) {
    const w = windows.find((x) => x.id === windowId);
    if (!w) return;
    const slotsInWindow = new Set(generateSlots(w.start, w.end, w.duration));
    const remaining = windows.filter((x) => x.id !== windowId);
    setWindows(remaining);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of slotsInWindow) {
        if (!initialSelected.has(s)) next.delete(s);
      }
      return next;
    });
    setSlotDurationMap((prev) => {
      const next = new Map(prev);
      for (const s of slotsInWindow) {
        next.delete(s);
      }
      return next;
    });
    setSaveOk(null);
    if (remaining.length === 0) {
      setBuilderPhase("idle");
      const defaultStart = alignWindowStartToSlotGrid(
        DEFAULT_SLOT_WINDOW_START,
        slotDurationMinutes,
      );
      const defaultEnd = alignWindowEndExclusiveToSlotGrid(
        DEFAULT_SLOT_WINDOW_END,
        slotDurationMinutes,
      );
      slotWindowStartRef.current = defaultStart;
      slotWindowEndRef.current = defaultEnd;
      setSlotWindowStart(defaultStart);
      setSlotWindowEnd(defaultEnd);
      setWindowOverlapError(null);
    }
  }

  const handleEditDateFromView = useCallback((isoDate: string) => {
    setMainTab("set");
    setMode("single");
    setSaveOk(null);
    setSaveError(null);
    setSingleDate(isoDate);
    setEditableDateFromView(isoDate);
  }, []);

  /** Bumped by ViewSchedulePanel after a holiday is marked so existingAvailabilityDates picks up the cleared day instantly. */
  const handleAvailabilityChanged = useCallback((changedDate?: string) => {
    setSaveError(null);
    if (changedDate) {
      setExistingAvailabilityDates((prev) => {
        const next = new Set(prev);
        next.delete(changedDate);
        return next;
      });
    }
    setViewScheduleListVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!meta) return;
    if (mainTab !== "set") return;
    if (mode !== "single") return;
    void fetchSlotsForDate(singleDate);
  }, [meta, mainTab, mode, singleDate, fetchSlotsForDate]);

  const scheduleIncludesToday = useMemo(() => {
    if (!meta) return false;
    if (mode === "single") return singleDate === meta.today;
    if (!rangeStart || !rangeEnd) return false;
    return meta.today >= rangeStart && meta.today <= rangeEnd;
  }, [meta, mode, singleDate, rangeStart, rangeEnd]);

  /** True when any calendar day between range start and end already has saved rows (grey on the picker). */
  const rangeIncludesAlreadyConfiguredDay = useMemo(() => {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return false;
    return enumerateInclusiveYmd(rangeStart, rangeEnd).some((d) =>
      existingAvailabilityDates.has(d),
    );
  }, [rangeStart, rangeEnd, existingAvailabilityDates]);
  const rangeExceedsMaxDays = useMemo(() => {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return false;
    return (
      enumerateInclusiveYmd(rangeStart, rangeEnd).length >
      MAX_DOCTOR_AVAILABILITY_RANGE_DAYS
    );
  }, [rangeStart, rangeEnd]);

  const selectableSlots = useMemo(() => {
    if (!meta) return displaySlots;
    if (!scheduleIncludesToday) return displaySlots;
    return displaySlots.filter(
      (t) => !isDoctorTimeInPast(meta.today, t, meta.timezone),
    );
  }, [meta, scheduleIncludesToday, displaySlots]);

  const builderOverlapsExisting = useMemo(() => {
    const windowOk = timeToMinutes(slotWindowEnd) > timeToMinutes(slotWindowStart);
    if (!windowOk) return false;
    return windows.some((w) =>
      windowsOverlap(slotWindowStart, slotWindowEnd, w.start, w.end),
    );
  }, [slotWindowStart, slotWindowEnd, windows]);


  useEffect(() => {
    if (!meta || !scheduleIncludesToday) return;
    setSelected((prev) => {
      const filtered = [...prev].filter(
        (t) => !isDoctorTimeInPast(meta.today, t, meta.timezone),
      );
      if (filtered.length === prev.size && filtered.every((t) => prev.has(t))) {
        return prev;
      }
      return new Set(filtered);
    });
  }, [meta, scheduleIncludesToday]);

  useEffect(() => {
    if (!meta || mode !== "range") return;
    const minStart = addOneDayYmd(meta.today);
    setRangeStart((s) => (s < minStart ? minStart : s));
  }, [mode, meta]);

  function toggleSlot(t: string) {
    if (bookedSlots.has(t)) {
      return;
    }
    if (
      meta &&
      scheduleIncludesToday &&
      isDoctorTimeInPast(meta.today, t, meta.timezone)
    ) {
      return;
    }
    setSaveOk(null);
    const wasSelected = selected.has(t);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
    if (!wasSelected) {
      setSlotDurationMap((prev) => {
        const next = new Map(prev);
        if (!next.has(t)) next.set(t, slotDurationMinutes);
        return next;
      });
    }
    setExplicitlyRemoved((prev) => {
      const next = new Set(prev);
      if (wasSelected) {
        if (initialSelected.has(t)) {
          next.add(t);
        }
      } else {
        next.delete(t);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!meta) return;
    if (mode === "range") {
      if (!rangeStart || !rangeEnd) {
        setSaveError("Select a start date and an end date for the range.");
        setSaveOk(null);
        return;
      }
      if (rangeStart > rangeEnd) {
        setSaveError("Start date must be on or before end date.");
        setSaveOk(null);
        return;
      }
      if (rangeIncludesAlreadyConfiguredDay) {
        setSaveError(
          "Every day from start through end must have no saved availability yet. This range includes at least one day that is already configured — narrow the range or use Single day / View Schedule → Edit for those days.",
        );
        setSaveOk(null);
        return;
      }
      if (rangeExceedsMaxDays) {
        setSaveError(RANGE_DAYS_LIMIT_ERROR);
        setSaveOk(null);
        return;
      }
    }
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      const slotStarts = [...selected]
        .filter((t) => {
          if (!scheduleIncludesToday) return true;
          return !isDoctorTimeInPast(meta.today, t, meta.timezone);
        })
        .sort();

      // Saving with no slots no longer wipes the day — that path is now
      // explicit via View Schedule -> Mark Holiday (clearDay:true). Bail out
      // here with an inline error so the user has clear next steps.
      if (slotStarts.length === 0) {
        setSaveError(
          "Select at least one slot, or use View Schedule -> Mark Holiday to clear the day.",
        );
        setSaving(false);
        return;
      }

      const currentSet = new Set(slotStarts);
      const removed = [...explicitlyRemoved];

      if (mode === "single" && windows.length > 0) {
        const newSlotStarts = [...currentSet];
        const bookedInWindows: string[] = [];
        const droppedUnbooked: string[] = [];
        for (const detail of currentDaySlotDetails) {
          if (currentSet.has(detail.startTime)) continue;
          const overlaps = newSlotStarts.some((ns) => {
            const nsDur = slotDurationMap.get(ns) ?? slotDurationMinutes;
            return slotOverlapsRange(
              detail.startTime,
              detail.slotDurationMinutes,
              ns,
              slotEndFromStart(ns, nsDur),
            );
          });
          if (!overlaps) continue;
          if (detail.booked) bookedInWindows.push(detail.startTime);
          else droppedUnbooked.push(detail.startTime);
        }
        if (bookedInWindows.length > 0) {
          setSaveError(
            `You have booked appointment(s) at ${bookedInWindows.join(", ")} inside your new time window. Adjust the window's start/end to skip those times before saving.`,
          );
          setSaving(false);
          return;
        }
        removed.push(...droppedUnbooked);
      }

      const newlyAdded = [...currentSet];

      const durMap: Record<string, number> = {};
      for (const s of slotStarts) {
        const dur = slotDurationMap.get(s);
        if (dur) durMap[s] = dur;
      }
      const hasPerSlotDurations = Object.keys(durMap).length > 0;

      const consultationTypeMap: Record<string, WindowConsultationType> = {};
      for (const s of slotStarts) {
        consultationTypeMap[s] = consultationTypeForSlot(s, windows);
      }
      const hasPerSlotConsultationTypes =
        Object.keys(consultationTypeMap).length > 0;

      const body =
        mode === "range"
          ? {
              mode: "range" as const,
              startDate: rangeStart,
              endDate: rangeEnd,
              slotStarts,
              slotDurationMinutes,
              clearDay: false,
              ...(hasPerSlotDurations ? { slotDurationMap: durMap } : {}),
              ...(hasPerSlotConsultationTypes
                ? { consultationTypeMap }
                : {}),
            }
          : {
              mode: "single" as const,
              singleDate,
              slotStarts,
              newSlots: newlyAdded.sort(),
              removedSlots: [...new Set(removed)].sort(),
              slotDurationMinutes,
              clearDay: false,
              ...(hasPerSlotDurations ? { slotDurationMap: durMap } : {}),
              ...(hasPerSlotConsultationTypes
                ? { consultationTypeMap }
                : {}),
            };
      const res = await fetch("/api/doctor/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Save failed");
      }
      const data = (await res.json()) as { affectedDates: number };
      setSaveOk(
        `Saved availability for ${data.affectedDates} day${data.affectedDates === 1 ? "" : "s"}.`,
      );
      setWindows([]);
      setSlotDurationMap(new Map());
      setBuilderPhase("idle");
      if (mode === "single") {
        await fetchSlotsForDate(singleDate);
      }
      setMeta((m) => (m ? { ...m, slotDurationMinutes } : null));
      setViewScheduleListVersion((v) => v + 1);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSlots() {
    if (slotsToDelete.size === 0 || !meta) return;
    setDeleting(true);
    setDeleteError(null);
    setDeleteOk(null);
    try {
      const res = await fetch("/api/doctor/availability", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: singleDate,
          slotStarts: [...slotsToDelete],
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Delete failed");
      }
      const data = (await res.json()) as { deletedCount: number };
      setDeleteOk(
        `Deleted ${data.deletedCount} slot${data.deletedCount === 1 ? "" : "s"}.`,
      );
      setSlotsToDelete(new Set());
      setDeleteMode(false);
      const refreshed = await refreshCurrentDaySlotDetailsOnly(singleDate);
      if (!refreshed) {
        setDeleteError("Deleted slots, but failed to refresh current schedule.");
      }
      setViewScheduleListVersion((v) => v + 1);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  if (metaError) {
    return (
      <div className="w-full bg-[#fafafa] py-6 md:py-8">
        <Container>
          <p className="font-montserrat text-sm text-red-600">{metaError}</p>
        </Container>
      </div>
    );
  }

  if (!meta) {
    const slotSkeletonCount = generateSlots(
      DEFAULT_SLOT_WINDOW_START,
      DEFAULT_SLOT_WINDOW_END,
      DEFAULT_SLOT_DURATION_MINUTES,
    ).length;
    return (
      <div className="w-full bg-[#fafafa] py-6 md:py-8">
        <Container>
          <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            {/* Title */}
            <Skeleton className="h-8 w-56 max-w-[85%] md:h-9" />
            {/* Tab buttons: Set Availability / View Schedule */}
            <div className="mt-5 flex flex-wrap gap-2">
              <Skeleton className="h-10 w-38 rounded-xl" />
              <Skeleton className="h-10 w-38 rounded-xl" />
            </div>
            {/* Description / timezone text */}
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-full max-w-2xl" />
              <Skeleton className="h-4 w-full max-w-xl" />
            </div>
            {/* Slot duration dropdown */}
            <div className="mt-5 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-11 w-48 rounded-xl" />
            </div>
            {/* Window start / Window end / Add Window button */}
            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-11 w-40 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-40 rounded-xl" />
              </div>
              <Skeleton className="h-10 w-32 rounded-xl" />
            </div>
            {/* Mode toggle: Single day / Range */}
            <div className="mt-6 flex flex-wrap gap-2">
              <Skeleton className="h-10 w-28 rounded-xl" />
              <Skeleton className="h-10 w-20 rounded-xl" />
            </div>
            {/* Calendar placeholder */}
            <Skeleton className="mt-6 h-64 w-full max-w-sm rounded-xl" />
            {/* Consultation type: 3 pills */}
            <div className="mt-6 space-y-2">
              <Skeleton className="h-4 w-32" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-10 w-28 rounded-xl" />
                <Skeleton className="h-10 w-28 rounded-xl" />
                <Skeleton className="h-10 w-16 rounded-xl" />
              </div>
            </div>
            {/* Slots header + Select all */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-10 w-28 rounded-xl" />
            </div>
            {/* Slot grid */}
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {Array.from({ length: slotSkeletonCount }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-10 min-w-22 rounded-xl"
                />
              ))}
            </div>
            <Skeleton className="mt-3 h-3 w-full max-w-md" />
            {/* Save button */}
            <Skeleton className="mt-8 h-11 w-24 rounded-xl" />
          </section>
        </Container>
      </div>
    );
  }

  const minDate = meta.today;
  const rangeStartMinDate = addOneDayYmd(minDate);
  const slotWindowOk =
    timeToMinutes(slotWindowEnd) > timeToMinutes(slotWindowStart);
  const editableSelectableSlots = selectableSlots.filter((slot) => !bookedSlots.has(slot));
  const allSlotsSelected =
    editableSelectableSlots.length > 0 &&
    editableSelectableSlots.every((t) => selected.has(t));

  /** Matches patient booking UI — readable, tappable, focus ring */
  const dateInputClassName =
    "block w-full min-w-0 cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 font-montserrat text-sm text-[#111111] shadow-sm [color-scheme:light] focus:border-[#2555F3] focus:outline-none focus:ring-2 focus:ring-[#2555F3]/30 md:py-2.5";

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
            My Schedule
          </h1>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMainTab("set")}
              className={cn(
                "cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors",
                mainTab === "set"
                  ? "bg-[#2555F3] text-white"
                  : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#f5f5f5]",
              )}
            >
              Set Availability
            </button>
            <button
              type="button"
              onClick={() => setMainTab("view")}
              className={cn(
                "cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors",
                mainTab === "view"
                  ? "bg-[#2555F3] text-white"
                  : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#f5f5f5]",
              )}
            >
              View Schedule
            </button>
          </div>

          <div
            className={cn(mainTab !== "view" && "hidden")}
            aria-hidden={mainTab !== "view"}
          >
            <ViewSchedulePanel
              timezone={meta.timezone}
              onEditDate={handleEditDateFromView}
              listRefreshVersion={viewScheduleListVersion}
              onAvailabilityChanged={handleAvailabilityChanged}
            />
          </div>
          <div
            className={cn(mainTab !== "set" && "hidden")}
            aria-hidden={mainTab !== "set"}
          >
            <p className="mt-4 font-montserrat text-sm text-[#5E5E5E]">
                Choose slot length and a time window for your clinic timezone (
                <span className="font-medium text-[#333333]">
                  {meta.timezone}
                </span>
                ). The last slot starts so it ends by the window end time.
                Times snap to the grid for the selected length. Dates before
                today are not available.
              </p>
              <div className="mt-5">
                <label
                  htmlFor="schedule-slot-duration"
                  className="font-montserrat text-sm font-medium text-[#333333]"
                >
                  Slot length
                </label>
                <select
                  id="schedule-slot-duration"
                  value={slotDurationMinutes}
                  onChange={(e) => {
                    applySlotDurationForEditing(
                      Number(e.target.value) as AllowedSlotDurationMinutes,
                    );
                  }}
                  className={cn(
                    dateInputClassName,
                    "mt-2 max-w-[min(100%,12rem)] cursor-pointer appearance-none bg-[url(\"data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23333333%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E\")] bg-[length:1rem_1rem] bg-[position:right_0.75rem_center] bg-no-repeat py-2 pl-3 pr-10",
                  )}
                  aria-label="Slot duration in minutes"
                >
                  {ALLOWED_SLOT_DURATION_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </div>

              {builderPhase !== "done" && (
                <>
                  {builderPhase === "adding" && (
                    <p className="mt-5 font-montserrat text-sm text-[#5E5E5E]">
                      Enter a new time range. It must not overlap with your existing windows.
                    </p>
                  )}
                  <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
                    <div>
                      <label
                        htmlFor="schedule-slot-window-start"
                        className="font-montserrat text-sm font-medium text-[#333333]"
                      >
                        Window start
                      </label>
                      <div
                        className="mt-2 w-full max-w-[10rem] cursor-pointer select-none"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          slotWindowStartInputRef.current?.showPicker?.()
                        }
                      >
                        <input
                          ref={slotWindowStartInputRef}
                          id="schedule-slot-window-start"
                          type="time"
                          step={slotDurationMinutes * 60}
                          value={slotWindowStart}
                          onChange={(e) => {
                            setSaveOk(null);
                            setWindowOverlapError(null);
                            const v = e.target.value;
                            if (!v) return;
                            setSlotWindowStart(
                              alignWindowStartToSlotGrid(v, slotDurationMinutes),
                            );
                          }}
                          className={cn(dateInputClassName, "w-full select-none")}
                          aria-label="Earliest slot start time"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="schedule-slot-window-end"
                        className="font-montserrat text-sm font-medium text-[#333333]"
                      >
                        Window end
                      </label>
                      <div
                        className="mt-2 w-full max-w-[10rem] cursor-pointer select-none"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => slotWindowEndInputRef.current?.showPicker?.()}
                      >
                        <input
                          ref={slotWindowEndInputRef}
                          id="schedule-slot-window-end"
                          type="time"
                          step={slotDurationMinutes * 60}
                          value={slotWindowEnd}
                          onChange={(e) => {
                            setSaveOk(null);
                            setWindowOverlapError(null);
                            const v = e.target.value;
                            if (!v) return;
                            setSlotWindowEnd(
                              alignWindowEndExclusiveToSlotGrid(
                                v,
                                slotDurationMinutes,
                              ),
                            );
                          }}
                          className={cn(dateInputClassName, "w-full select-none")}
                          aria-label="End of booking window (exclusive)"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="font-montserrat text-sm font-medium text-[#333333]">
                        Mode
                      </p>
                      <div className="mt-2">
                        <WindowConsultationTypePicker
                          value={draftWindowConsultationType}
                          onChange={(next) => {
                            setSaveOk(null);
                            setDraftWindowConsultationType(next);
                          }}
                          ariaLabel="Consultation mode for new window"
                        />
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        disabled={!slotWindowOk || builderOverlapsExisting}
                        onClick={addWindow}
                        className="cursor-pointer rounded-xl border border-[#2555F3] bg-[#2555F3] px-4 py-2 font-montserrat text-sm font-medium text-white transition-colors hover:bg-[#1e44c7] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        + Add Window
                      </button>
                    </div>
                  </div>
                  {!slotWindowOk && !windowOverlapError && !saveOk && (
                    <p className="mt-2 font-montserrat text-sm text-red-600">
                      End time must be after start time.
                    </p>
                  )}
                  {windowOverlapError && (
                    <p className="mt-2 font-montserrat text-sm text-red-600">
                      {windowOverlapError}
                    </p>
                  )}
                  {slotWindowOk && builderOverlapsExisting && !windowOverlapError && (
                    <p className="mt-2 font-montserrat text-sm text-amber-600">
                      This range overlaps with {windows.find((w) => windowsOverlap(slotWindowStart, slotWindowEnd, w.start, w.end))?.start}–{windows.find((w) => windowsOverlap(slotWindowStart, slotWindowEnd, w.start, w.end))?.end}. Adjust times.
                    </p>
                  )}
                </>
              )}

              {builderPhase === "done" && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setBuilderPhase("adding");
                      const startCandidate =
                        windows.length > 0
                          ? windows.reduce((maxW, w) =>
                              timeToMinutes(w.end) > timeToMinutes(maxW.end)
                                ? w
                                : maxW,
                            ).end
                          : DEFAULT_SLOT_WINDOW_START;

                      const snappedStart = alignWindowStartToSlotGrid(
                        startCandidate,
                        slotDurationMinutes,
                      );
                      const startMinutes = timeToMinutes(snappedStart);
                      if (startMinutes + slotDurationMinutes >= 24 * 60) {
                        setWindowOverlapError(
                          "Not enough room for a new window with the current slot duration.",
                        );
                        return;
                      }

                      const endCandidateMinutes = Math.min(
                        startMinutes + 60,
                        timeToMinutes(DEFAULT_SLOT_WINDOW_END),
                      );
                      const snappedEnd = alignWindowEndExclusiveToSlotGrid(
                        minutesToTime(endCandidateMinutes),
                        slotDurationMinutes,
                      );

                      setSlotWindowStart(snappedStart);
                      setSlotWindowEnd(snappedEnd);
                      setWindowOverlapError(null);
                    }}
                    className="cursor-pointer rounded-xl border border-[#2555F3] bg-white px-4 py-2 font-montserrat text-sm font-medium text-[#2555F3] transition-colors hover:bg-[#f0f4ff]"
                  >
                    + Set New Window
                  </button>
                </div>
              )}

              {windows.length > 0 && (
                <div className="mt-4 rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3">
                  <p className="font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5E5E5E]">
                    Added windows
                  </p>
                  <ul className="mt-2 space-y-1">
                    {windows.map((w) => (
                      <li
                        key={w.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e5e5e5] bg-white px-3 py-2"
                      >
                        <span className="font-montserrat text-sm text-[#333333]">
                          {w.start}–{w.end} → {w.duration} min
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <WindowConsultationTypePicker
                            value={w.consultationType}
                            onChange={(next) =>
                              updateWindowConsultationType(w.id, next)
                            }
                            ariaLabel={`Consultation mode for window ${w.start} to ${w.end}`}
                            compact
                          />
                          <button
                            type="button"
                            onClick={() => removeWindow(w.id)}
                            className="cursor-pointer font-montserrat text-sm text-red-500 hover:text-red-700"
                            aria-label={`Remove window ${w.start}–${w.end}`}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("single");
                setSaveOk(null);
              }}
              className={cn(
                "cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors",
                mode === "single"
                  ? "bg-[#2555F3] text-white"
                  : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#f5f5f5]",
              )}
            >
              Single day
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("range");
                setSaveOk(null);
                setBookedSlots(new Set());
              }}
              className={cn(
                "cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors",
                mode === "range"
                  ? "bg-[#2555F3] text-white"
                  : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#f5f5f5]",
              )}
            >
              Range
            </button>
          </div>

          {mode === "single" ? (
            <div className="mt-6">
              <p
                id="schedule-single-date-label"
                className="font-montserrat text-sm font-medium text-[#333333]"
              >
                Date
              </p>
              <div className="mt-2" aria-labelledby="schedule-single-date-label">
                <SetAvailabilityCalendar
                  value={singleDate}
                  minDate={minDate}
                  disabledDates={existingAvailabilityDates}
                  loadingDisabledDates={existingAvailabilityDatesLoading}
                  exceptionDates={
                    editableDateFromView
                      ? new Set([editableDateFromView])
                      : undefined
                  }
                  onSelect={(nextDate) => {
                    setSaveOk(null);
                    if (nextDate !== editableDateFromView) {
                      setEditableDateFromView(null);
                    }
                    setSingleDate(nextDate);
                  }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-montserrat text-xs text-[#5E5E5E]">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded border border-[#e5e5e5] bg-[#ECECEC]"
                  />
                  Already configured
                </span>
                <span>
                  Greyed-out dates already have availability configured — go to
                  View Schedule → Edit to modify them.
                </span>
              </div>
              {loadError && (
                <p className="mt-2 font-montserrat text-sm text-red-600">
                  {loadError}
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="mt-3 font-montserrat text-xs text-[#5E5E5E]">
                You can set availability for up to 65 days (about 2 months) at a
                time. For longer periods, save in smaller chunks.
              </p>
              <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
                <div className="min-w-0 flex-1">
                  <p
                    id="schedule-range-start-label"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Start date
                  </p>
                  <div
                    className="mt-2"
                    aria-labelledby="schedule-range-start-label"
                  >
                    <SetAvailabilityCalendar
                      value={rangeStart}
                      minDate={rangeStartMinDate}
                      disabledDates={existingAvailabilityDates}
                      loadingDisabledDates={existingAvailabilityDatesLoading}
                      gridAriaLabel="Select range start date"
                      onSelect={(nextStart) => {
                        setSaveOk(null);
                        setRangeStart(nextStart);
                        setRangeEnd((prevEnd) =>
                          prevEnd &&
                          (nextStart > prevEnd ||
                            enumerateInclusiveYmd(nextStart, prevEnd).length >
                              MAX_DOCTOR_AVAILABILITY_RANGE_DAYS)
                            ? ""
                            : prevEnd,
                        );
                      }}
                    />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    id="schedule-range-end-label"
                    className="font-montserrat text-sm font-medium text-[#333333]"
                  >
                    End date
                  </p>
                  <div
                    className="mt-2"
                    aria-labelledby="schedule-range-end-label"
                  >
                    <SetAvailabilityCalendar
                      value={rangeEnd}
                      minDate={
                        rangeStart >= rangeStartMinDate
                          ? rangeStart
                          : rangeStartMinDate
                      }
                      disabledDates={existingAvailabilityDates}
                      loadingDisabledDates={existingAvailabilityDatesLoading}
                      gridAriaLabel="Select range end date"
                      onSelect={(nextEnd) => {
                        setSaveOk(null);
                        if (
                          rangeStart &&
                          rangeStart <= nextEnd &&
                          enumerateInclusiveYmd(rangeStart, nextEnd).length >
                            MAX_DOCTOR_AVAILABILITY_RANGE_DAYS
                        ) {
                          setSaveError(RANGE_DAYS_LIMIT_ERROR);
                          return;
                        }
                        setSaveError(null);
                        setRangeEnd(nextEnd);
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-montserrat text-xs text-[#5E5E5E]">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded border border-[#e5e5e5] bg-[#ECECEC]"
                  />
                  Already configured
                </span>
                <span>
                  Greyed-out dates already have availability — use View Schedule
                  → Edit to modify them. Range mode applies to every day in
                  between: all of those days must be empty (no grey days inside
                  the span).
                </span>
              </div>
              {rangeIncludesAlreadyConfiguredDay && !saveOk ? (
                <p className="mt-3 font-montserrat text-sm text-red-600">
                  This range includes at least one day that already has
                  availability. Narrow the start or end date so the full span has
                  no grey days, or edit those days in Single day mode.
                </p>
              ) : null}
              {rangeExceedsMaxDays ? (
                <p className="mt-3 font-montserrat text-sm text-red-600">
                  You can set availability for up to 65 days at a time. For
                  longer periods, save in smaller chunks.
                </p>
              ) : null}
              <p className="mt-3 font-montserrat text-xs text-[#5E5E5E]">
                To set today&apos;s slots, use Single day mode.
              </p>
            </>
          )}

          {mode === "single" &&
          editableDateFromView === singleDate &&
          loadingSlots ? (
            <CurrentSchedulePanelSkeleton />
          ) : mode === "single" &&
            editableDateFromView === singleDate &&
            currentDaySlotDetails.length > 0 ? (
            <div className="mt-8 rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5E5E5E]">
                  Current schedule
                </p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={deleteMode}
                  onClick={() => {
                    setDeleteMode((v) => !v);
                    setSlotsToDelete(new Set());
                    setDeleteError(null);
                    setDeleteOk(null);
                  }}
                  className={cn(
                    "cursor-pointer rounded-lg border px-3 py-1 font-montserrat text-xs font-medium transition-colors",
                    deleteMode
                      ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                      : "border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#f5f5f5]",
                  )}
                >
                  {deleteMode ? "Cancel delete" : "Delete Slots"}
                </button>
              </div>
              {deleteMode ? (
                <div className="mt-3 space-y-3">
                  <SlotSummaryDeletePicker
                    slots={currentDaySlotDetails}
                    selectedStarts={slotsToDelete}
                    onToggleSlot={(startTime) => {
                      const slot = currentDaySlotDetails.find(
                        (s) => s.startTime === startTime,
                      );
                      if (slot?.booked) return;
                      setSlotsToDelete((prev) => {
                        const next = new Set(prev);
                        if (next.has(startTime)) next.delete(startTime);
                        else next.add(startTime);
                        return next;
                      });
                    }}
                    onSetGroupSelection={(startTimes, selected) => {
                      const bookedStarts = new Set(
                        currentDaySlotDetails
                          .filter((s) => s.booked)
                          .map((s) => s.startTime),
                      );
                      setSlotsToDelete((prev) => {
                        const next = new Set(prev);
                        for (const t of startTimes) {
                          if (bookedStarts.has(t)) continue;
                          if (selected) next.add(t);
                          else next.delete(t);
                        }
                        return next;
                      });
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={slotsToDelete.size === 0 || deleting}
                      onClick={() => void handleDeleteSlots()}
                      className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 font-montserrat text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deleting
                        ? "Deleting…"
                        : `Delete selected (${slotsToDelete.size})`}
                    </button>
                    {deleteError ? (
                      <p className="font-montserrat text-xs text-red-600">
                        {deleteError}
                      </p>
                    ) : null}
                    {deleteOk ? (
                      <p className="font-montserrat text-xs text-green-700">
                        {deleteOk}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <SlotSummaryFromDetails slots={currentDaySlotDetails} />
                  <p className="mt-2 font-montserrat text-[11px] text-[#5E5E5E]">
                    This is your current saved schedule. You can edit slots below.
                  </p>
                </>
              )}
            </div>
          ) : null}

          <div className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-montserrat text-sm font-medium text-[#333333]">
                Slots
                {windows.length > 0
                  ? ` (${[...new Set(windows.map((w) => w.duration))].sort((a, b) => a - b).join("/")} min)`
                  : ` (${slotDurationMinutes} minutes each)`}
              </p>
              <button
                type="button"
                disabled={
                  (mode === "single" && loadingSlots) ||
                  editableSelectableSlots.length === 0
                }
                onClick={() => {
                  setSaveOk(null);
                  if (allSlotsSelected) {
                    setSelected(
                      new Set(
                        [...selected].filter((slot) => bookedSlots.has(slot)),
                      ),
                    );
                    setExplicitlyRemoved((prev) => {
                      const next = new Set(prev);
                      for (const slot of editableSelectableSlots) {
                        if (initialSelected.has(slot)) {
                          next.add(slot);
                        }
                      }
                      return next;
                    });
                  } else {
                    const next = new Set(selected);
                    for (const slot of editableSelectableSlots) {
                      next.add(slot);
                    }
                    setSelected(next);
                    setSlotDurationMap((prev) => {
                      const nextMap = new Map(prev);
                      for (const slot of editableSelectableSlots) {
                        if (!nextMap.has(slot)) nextMap.set(slot, slotDurationMinutes);
                      }
                      return nextMap;
                    });
                    setExplicitlyRemoved((prev) => {
                      const cleared = new Set(prev);
                      for (const slot of editableSelectableSlots) {
                        cleared.delete(slot);
                      }
                      return cleared;
                    });
                  }
                }}
                className={cn(
                  "shrink-0 cursor-pointer rounded-xl border px-4 py-2 font-montserrat text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  allSlotsSelected
                    ? "border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#f5f5f5]"
                    : "border-[#2555F3] bg-[#2555F3] text-white hover:bg-[#1e44c7]",
                )}
              >
                {allSlotsSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {displaySlots.length > 0 ? (
                displaySlots.map((t) => {
                  const on = selected.has(t);
                  const booked = bookedSlots.has(t);
                  const past =
                    scheduleIncludesToday &&
                    isDoctorTimeInPast(meta.today, t, meta.timezone);
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={past || booked}
                      aria-disabled={past || booked}
                      onClick={() => toggleSlot(t)}
                      className={cn(
                        "min-w-[5.5rem] rounded-xl border px-3 py-2 font-montserrat text-sm transition-colors",
                        booked
                          ? "cursor-not-allowed border-amber-300 bg-amber-50 text-amber-800"
                          : past
                          ? "cursor-not-allowed border-[#e5e5e5] bg-[#f5f5f5] text-[#9A9A9A] opacity-70"
                          : cn(
                              "cursor-pointer",
                              on
                                ? "border-[#2555F3] bg-[#2555F3] text-white"
                                : "border-[#e5e5e5] bg-[#fafafa] text-[#333333] hover:bg-[#f0f0f0]",
                            ),
                      )}
                    >
                      {booked ? `${t} (Booked)` : t}
                    </button>
                  );
                })
              ) : (
                <p className="font-montserrat text-sm text-[#5E5E5E]">
                  Add a window to see available slots.
                </p>
              )}
            </div>
            <p className="mt-3 font-montserrat text-xs text-[#5E5E5E]">
              {mode === "range"
                ? "Selected slots apply to every day in the range on save."
                : "Changes apply only to the selected day."}
            </p>
            {bookedSlots.size > 0 && (
              <p className="mt-2 font-montserrat text-xs text-amber-700">
                Booked slots are locked and cannot be edited.
              </p>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              className="h-11 cursor-pointer rounded-xl bg-[#2555F3] font-montserrat text-sm font-medium text-white hover:bg-[#1e44c7] disabled:cursor-not-allowed"
              disabled={
                saving ||
                (mode === "single" && loadingSlots) ||
                (mode === "range" &&
                  (!rangeEnd ||
                    rangeIncludesAlreadyConfiguredDay ||
                    rangeExceedsMaxDays))
              }
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            {saveOk && (
              <p className="font-montserrat text-sm text-green-700">{saveOk}</p>
            )}
            {saveError && (
              <p className="font-montserrat text-sm text-red-600">
                {saveError}
              </p>
            )}
          </div>
          </div>
        </section>
      </Container>
    </div>
  );
}
