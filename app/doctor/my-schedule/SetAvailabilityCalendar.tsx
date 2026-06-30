"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Currently selected day, YYYY-MM-DD. */
  value: string;
  /** Earliest selectable day, YYYY-MM-DD (typically doctor-local "today"). */
  minDate: string;
  /** Set of YYYY-MM-DD strings already configured — rendered as disabled. */
  disabledDates: Set<string>;
  /**
   * When set (e.g. public booking), only these dates are selectable; others are disabled.
   * Ignores `disabledDates` / `exceptionDates` for eligibility (pass empty `disabledDates`).
   */
  enabledDates?: Set<string>;
  /**
   * Dates that should remain selectable even if present in `disabledDates`
   * (e.g. the date the doctor came from via View Schedule -> Edit).
   */
  exceptionDates?: Set<string>;
  /** While true, prevent date picks until configured-date metadata is loaded. */
  loadingDisabledDates?: boolean;
  /** Optional loading caption under the grid (defaults by mode). */
  loadingCaption?: string;
  /** Accessible name for the date grid (defaults by mode). */
  gridAriaLabel?: string;
  /** When true, month controls are disabled and the grid is non-interactive (e.g. booking preview before consultation type). */
  readOnly?: boolean;
  /** While true, show a loading overlay on the date grid (e.g. fetching availability for a new month). */
  monthLoading?: boolean;
  /** Called when the visible calendar month changes (navigation, controlled value sync, or initial mount). */
  onViewingMonthChange?: (year: number, month0: number) => void;
  onSelect: (ymd: string) => void;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toYmd(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

function parseYmd(ymd: string): { year: number; month0: number; day: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { year: y, month0: m - 1, day: d };
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function firstWeekdayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0, 1)).getUTCDay();
}

function monthLabel(year: number, month0: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month0, 1)));
}

export function SetAvailabilityCalendar({
  value,
  minDate,
  disabledDates,
  enabledDates,
  exceptionDates,
  loadingDisabledDates = false,
  loadingCaption,
  gridAriaLabel,
  readOnly = false,
  monthLoading = false,
  onViewingMonthChange,
  onSelect,
}: Props) {
  const initialAnchor = parseYmd(value || minDate);
  const [viewYear, setViewYear] = useState(initialAnchor.year);
  const [viewMonth0, setViewMonth0] = useState(initialAnchor.month0);

  // Keep the visible month aligned with the externally controlled value
  // (e.g. doctor clicks Edit from View Schedule for a date in another month).
  useEffect(() => {
    if (!value) return;
    const { year, month0 } = parseYmd(value);
    // Keep month view in sync with controlled value updates from parent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewYear(year);
    setViewMonth0(month0);
  }, [value]);

  useEffect(() => {
    onViewingMonthChange?.(viewYear, viewMonth0);
  }, [viewYear, viewMonth0, onViewingMonthChange]);

  const cells = useMemo(() => {
    const total = daysInMonth(viewYear, viewMonth0);
    const leadingBlanks = firstWeekdayOfMonth(viewYear, viewMonth0);
    const list: ({ ymd: string; day: number } | null)[] = [];
    for (let i = 0; i < leadingBlanks; i++) list.push(null);
    for (let d = 1; d <= total; d++) {
      list.push({ ymd: toYmd(viewYear, viewMonth0, d), day: d });
    }
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [viewYear, viewMonth0]);

  function goPrevMonth() {
    if (viewMonth0 === 0) {
      setViewYear((y) => y - 1);
      setViewMonth0(11);
    } else {
      setViewMonth0((m) => m - 1);
    }
  }

  function goNextMonth() {
    if (viewMonth0 === 11) {
      setViewYear((y) => y + 1);
      setViewMonth0(0);
    } else {
      setViewMonth0((m) => m + 1);
    }
  }

  // Disable navigating to months entirely before the min-date month.
  const minAnchor = parseYmd(minDate);
  const canGoPrev =
    viewYear > minAnchor.year ||
    (viewYear === minAnchor.year && viewMonth0 > minAnchor.month0);

  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-xl border border-[#e5e5e5] bg-white p-3 shadow-sm",
        readOnly && "pointer-events-none select-none opacity-75",
      )}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrevMonth}
          disabled={!canGoPrev || loadingDisabledDates || readOnly || monthLoading}
          aria-label="Previous month"
          className={cn(
            "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#e5e5e5] bg-white text-[#333333] transition-colors hover:bg-[#f5f5f5]",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p
          className="font-montserrat text-sm font-semibold text-[#333333]"
          aria-live="polite"
        >
          {monthLabel(viewYear, viewMonth0)}
        </p>
        <button
          type="button"
          onClick={goNextMonth}
          disabled={loadingDisabledDates || readOnly || monthLoading}
          aria-label="Next month"
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#e5e5e5] bg-white text-[#333333] transition-colors hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center font-montserrat text-[11px] font-semibold uppercase tracking-wide text-[#5E5E5E]">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="relative mt-1">
        <div
          className="grid grid-cols-7 gap-1"
          role="grid"
          aria-label={gridAriaLabel ?? "Select availability date"}
          aria-busy={loadingDisabledDates || monthLoading}
        >
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`pad-${idx}`} className="h-9" aria-hidden="true" />;
          }
          const isPast = cell.ymd < minDate;
          const bookingMode = enabledDates !== undefined;
          const notInBookingWindow =
            bookingMode && !enabledDates!.has(cell.ymd);
          const isExisting =
            !bookingMode &&
            disabledDates.has(cell.ymd) &&
            !exceptionDates?.has(cell.ymd);
          const isDisabled =
            readOnly ||
            monthLoading ||
            loadingDisabledDates ||
            isPast ||
            isExisting ||
            notInBookingWindow;
          const isSelected = cell.ymd === value;
          const showAsSelected = isSelected && !isDisabled;

          return (
            <button
              key={cell.ymd}
              type="button"
              role="gridcell"
              disabled={isDisabled}
              aria-disabled={isDisabled}
              aria-selected={showAsSelected}
              aria-label={
                readOnly
                  ? `${cell.ymd} (preview)`
                  : notInBookingWindow
                    ? `${cell.ymd} (no availability)`
                    : isExisting
                      ? `${cell.ymd} (already configured)`
                      : loadingDisabledDates
                        ? `${cell.ymd} (checking configured dates)`
                        : isPast
                          ? `${cell.ymd} (past)`
                          : cell.ymd
              }
              onClick={() => !isDisabled && onSelect(cell.ymd)}
              className={cn(
                "h-9 rounded-lg border font-montserrat text-sm transition-colors",
                showAsSelected
                  ? cn(
                      "border-[#2555F3] bg-[#2555F3] font-semibold text-white",
                      loadingDisabledDates ? "cursor-wait opacity-80" : "cursor-pointer",
                    )
                  : notInBookingWindow
                    ? "cursor-not-allowed border-[#e5e5e5] bg-[#fafafa] text-[#C8C8C8]"
                    : isExisting
                      ? "cursor-not-allowed border-[#e5e5e5] bg-[#ECECEC] text-[#9A9A9A] line-through"
                      : loadingDisabledDates
                        ? "cursor-wait border-[#e5e5e5] bg-[#fafafa] text-[#9A9A9A]"
                        : isPast
                          ? "cursor-not-allowed border-transparent bg-transparent text-[#C8C8C8]"
                          : "cursor-pointer border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#f5f8ff] hover:border-[#2555F3]/40",
              )}
              title={
                readOnly
                  ? "Choose a consultation type to see available dates."
                  : isExisting
                    ? "Already configured. Use View Schedule -> Edit to modify."
                    : notInBookingWindow
                      ? "No appointments available on this date."
                      : undefined
              }
            >
              {cell.day}
            </button>
          );
        })}
        </div>
        {monthLoading ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/75"
            aria-live="polite"
          >
            <Loader2
              className="size-6 animate-spin text-[#2555F3]"
              aria-hidden
            />
            <span className="font-montserrat text-xs text-[#5E5E5E]">
              Loading dates…
            </span>
          </div>
        ) : null}
      </div>
      {loadingDisabledDates ? (
        <p className="mt-2 font-montserrat text-xs text-[#5E5E5E]">
          {loadingCaption ??
            (enabledDates !== undefined
              ? "Loading available dates..."
              : "Checking configured dates...")}
        </p>
      ) : null}
    </div>
  );
}
