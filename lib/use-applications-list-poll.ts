"use client";

import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 60_000;

export function useApplicationsListPoll(options: {
  enabled: boolean;
  hasLoadedMore: boolean;
  pollBlocked: boolean;
  refresh: () => void | Promise<void>;
}) {
  const { enabled, hasLoadedMore, pollBlocked, refresh } = options;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;

    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (hasLoadedMore) return;
      if (pollBlocked) return;
      void refreshRef.current();
    };

    const intervalId = window.setInterval(maybeRefresh, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        maybeRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, hasLoadedMore, pollBlocked]);
}
