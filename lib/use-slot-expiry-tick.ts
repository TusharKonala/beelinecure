"use client";

import { useEffect, useMemo, useState } from "react";
import { doctorLocalToUtc } from "@/lib/timezone-display";

export type SlotExpiryRef = {
  doctorDate: string;
  startTime: string;
  doctorTimezone: string;
};

const MAX_DELAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_BUFFER_MS = 50;

function nearestFutureSlotStartMs(
  slots: SlotExpiryRef[],
  nowMs: number,
): number | null {
  let nearest: number | null = null;
  for (const slot of slots) {
    const startMs = doctorLocalToUtc(
      slot.doctorDate,
      slot.startTime,
      slot.doctorTimezone,
    ).getTime();
    if (startMs <= nowMs) continue;
    if (nearest === null || startMs < nearest) nearest = startMs;
  }
  return nearest;
}

/**
 * Bump a counter when the next visible slot becomes past so slot filters
 * re-run without refetching. Schedules one timeout per nearest future start.
 */
export function useSlotExpiryTick(
  enabled: boolean,
  slots: SlotExpiryRef[] = [],
): number {
  const [tick, setTick] = useState(0);

  const slotsKey = useMemo(
    () =>
      slots
        .map((s) => `${s.doctorDate}:${s.startTime}:${s.doctorTimezone}`)
        .sort()
        .join("|"),
    [slots],
  );

  useEffect(() => {
    if (!enabled) return;

    const scheduleNext = () => {
      const nearestMs = nearestFutureSlotStartMs(slots, Date.now());
      if (nearestMs === null) return undefined;

      const delay = Math.min(
        Math.max(nearestMs - Date.now() + EXPIRY_BUFFER_MS, EXPIRY_BUFFER_MS),
        MAX_DELAY_MS,
      );

      return window.setTimeout(() => {
        setTick((t) => t + 1);
      }, delay);
    };

    let timeoutId = scheduleNext();
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [enabled, slotsKey, tick]);

  return tick;
}
