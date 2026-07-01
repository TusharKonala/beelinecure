"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Transient message state that auto-clears after `ttlMs`. Used for TTL banners
 * (e.g. "doctor changed timezone") shared across booking/reschedule flows.
 */
export function useAutoDismissMessage(ttlMs = 5000) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    clearTimer();
    setMessage(null);
  }, [clearTimer]);

  const show = useCallback(
    (text: string) => {
      clearTimer();
      setMessage(text);
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        setMessage(null);
      }, ttlMs);
    },
    [clearTimer, ttlMs],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { message, show, clear };
}
