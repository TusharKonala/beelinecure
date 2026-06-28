"use client";

import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 300_000;

type AppointmentsListTab =
  | "upcoming"
  | "pending-review"
  | "completed"
  | "cancelled";

function shouldPollTab(tab: AppointmentsListTab): boolean {
  return tab === "upcoming" || tab === "pending-review";
}

export function useAppointmentsListPoll(options: {
  tab: AppointmentsListTab;
  pollBlocked: boolean;
  refresh: () => void | Promise<void>;
}) {
  const { tab, pollBlocked, refresh } = options;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!shouldPollTab(tab)) return;

    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
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
  }, [tab, pollBlocked]);
}
