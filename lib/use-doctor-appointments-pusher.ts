"use client";

import { useEffect } from "react";
import type { AppointmentsChangedPayload } from "@/lib/pusher-server";
import Pusher from "pusher-js";

export function useDoctorAppointmentsPusher(input: {
  doctorId: string;
  enabled: boolean;
  onAppointmentsChanged: () => void;
}) {
  const onAppointmentsChanged = input.onAppointmentsChanged;

  useEffect(() => {
    if (!input.enabled || !input.doctorId) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });
    const channelName = `doctor-appointments-${input.doctorId}`;
    const channel = pusher.subscribe(channelName);

    const handler = (_payload: AppointmentsChangedPayload) => {
      onAppointmentsChanged();
    };

    channel.bind("appointments-changed", handler);

    return () => {
      channel.unbind("appointments-changed", handler);
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [input.doctorId, input.enabled, onAppointmentsChanged]);
}
