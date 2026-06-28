"use client";

import { useEffect } from "react";
import Pusher from "pusher-js";
import type { NotificationCreatedPayload } from "@/lib/pusher-server";

export function useNotificationPusher(input: {
  userId: string | null;
  enabled: boolean;
  onNotification: (payload: NotificationCreatedPayload) => void;
}) {
  const onNotification = input.onNotification;
  const { userId, enabled } = input;

  useEffect(() => {
    if (!enabled || !userId) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, {
      cluster,
      authEndpoint: "/api/pusher/auth",
    });
    const channelName = `private-user-${userId}`;
    const channel = pusher.subscribe(channelName);

    const handler = (payload: NotificationCreatedPayload) => {
      onNotification(payload);
    };

    channel.bind("notification-created", handler);

    return () => {
      channel.unbind("notification-created", handler);
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [userId, enabled, onNotification]);
}
