"use client";

import { useEffect, useState } from "react";

/** Bump a counter on an interval so slot past-filters re-run without refetching. */
export function useSlotExpiryTick(
  enabled: boolean,
  intervalMs = 60_000,
): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);

  return tick;
}
