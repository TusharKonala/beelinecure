"use client";

import { useEffect } from "react";
import type { AppointmentsChangedPayload } from "@/lib/pusher-server";
import Pusher from "pusher-js";

export function useAdminAppointmentsPusher(input: {
  enabled: boolean;
  onAppointmentsChanged: (payload: AppointmentsChangedPayload) => void;
}) {
  const onAppointmentsChanged = input.onAppointmentsChanged;

  useEffect(() => {
    if (!input.enabled) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });
    const channelName = "admin-appointments";
    const channel = pusher.subscribe(channelName);

    const handler = (payload: AppointmentsChangedPayload) => {
      onAppointmentsChanged(payload);
    };

    channel.bind("appointments-changed", handler);

    return () => {
      channel.unbind("appointments-changed", handler);
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [input.enabled, onAppointmentsChanged]);
}
