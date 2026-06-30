"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { USER_ROLE } from "@/lib/user-role";
import { useNotificationPusher } from "@/lib/use-notification-pusher";
import type { NotificationCreatedPayload } from "@/lib/pusher-server";

type ToastNotification = {
  id: string;
  title: string;
  message: string;
  dismissAt: number;
};

const TOAST_TTL_MS = 6_000;

export const DOCTOR_UNREAD_COUNT_EVENT = "doctor-notifications:unread-count";

export function DoctorNotificationToaster() {
  const { data: session, status } = useSession();
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [pendingNavigationToastId, setPendingNavigationToastId] = useState<string | null>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  const isDoctor = useMemo(() => {
    return session?.user?.role === USER_ROLE.DOCTOR;
  }, [session?.user?.role]);

  const currentUserId = session?.user?.id ?? null;
  const enabled = status === "authenticated" && isDoctor;

  // Re-fetch unread to keep the nav badge exact and reconcile the seen set.
  // Event-driven (mount + each Pusher event), so no polling interval and no
  // count-drift from incrementing per notification.
  const refreshUnread = useCallback(async () => {
    try {
      const [unreadRes, countRes] = await Promise.all([
        fetch("/api/notifications/unread", { cache: "no-store" }),
        fetch("/api/notifications/unread-count", { cache: "no-store" }),
      ]);
      if (unreadRes.ok) {
        const data = (await unreadRes.json()) as {
          notifications?: { id: string }[];
        };
        const notifications = Array.isArray(data.notifications)
          ? data.notifications
          : [];
        notifications.forEach((notification) =>
          seenNotificationIdsRef.current.add(notification.id),
        );
      }
      if (countRes.ok) {
        const countData = (await countRes.json()) as { count?: unknown };
        const count =
          typeof countData.count === "number" && Number.isFinite(countData.count)
            ? Math.max(0, Math.floor(countData.count))
            : 0;
        window.dispatchEvent(
          new CustomEvent<number>(DOCTOR_UNREAD_COUNT_EVENT, {
            detail: count,
          }),
        );
      }
    } catch {
      // best-effort
    }
  }, []);

  // Initial seed on mount: set badge + seen IDs only (no toasts on load).
  useEffect(() => {
    if (!enabled) {
      seenNotificationIdsRef.current = new Set();
      return;
    }
    void refreshUnread();
  }, [enabled, refreshUnread]);

  const handleNotification = useCallback(
    (payload: NotificationCreatedPayload) => {
      if (seenNotificationIdsRef.current.has(payload.id)) return;
      seenNotificationIdsRef.current.add(payload.id);

      // Suppress toasts for actions the recipient performed themselves. The
      // notification still appears in the notifications page/history and the
      // badge still updates via refreshUnread below.
      const isSelfAction =
        Boolean(payload.actorUserId) && payload.actorUserId === currentUserId;

      if (!isSelfAction) {
        setToasts((current) => {
          if (current.some((toast) => toast.id === payload.id)) return current;
          return [
            ...current,
            {
              id: payload.id,
              title: payload.title,
              message: payload.message,
              dismissAt: Date.now() + TOAST_TTL_MS,
            },
          ];
        });
      }

      void refreshUnread();
    },
    [currentUserId, refreshUnread],
  );

  useNotificationPusher({
    userId: currentUserId,
    enabled,
    onNotification: handleNotification,
  });

  useEffect(() => {
    if (toasts.length === 0) return;

    const now = Date.now();
    const nextDismissAt = Math.min(...toasts.map((toast) => toast.dismissAt));
    const timeoutMs = Math.max(0, nextDismissAt - now);

    const timeout = setTimeout(() => {
      const currentTime = Date.now();
      setToasts((current) => current.filter((toast) => toast.dismissAt > currentTime));
    }, timeoutMs + 50);

    return () => clearTimeout(timeout);
  }, [toasts]);

  if (!enabled || toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-100 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <Link
          key={toast.id}
          href="/doctor/notifications"
          onClick={() => setPendingNavigationToastId(toast.id)}
          className={`pointer-events-auto block rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-lg transition-all hover:bg-[#fafcff] active:scale-[0.99] ${
            pendingNavigationToastId === toast.id ? "opacity-80" : ""
          }`}
          aria-busy={pendingNavigationToastId === toast.id}
        >
          <article role="status" aria-live="polite">
            <p className="font-montserrat text-sm font-semibold text-[#333333]">{toast.title}</p>
            <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">{toast.message}</p>
            <p className="mt-3 font-montserrat text-xs font-semibold text-[#2555F3]">
              {pendingNavigationToastId === toast.id
                ? "Opening notifications..."
                : "View notifications →"}
            </p>
          </article>
        </Link>
      ))}
    </div>
  );
}
