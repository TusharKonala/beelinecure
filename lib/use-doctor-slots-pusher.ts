"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Pusher from "pusher-js";
import type { SlotUpdatedPayload } from "@/lib/slot-hold-shared";

export function useDoctorSlotsPusher(input: {
  doctorId: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!input.enabled || !input.doctorId) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });
    const channelName = `doctor-slots-${input.doctorId}`;
    const channel = pusher.subscribe(channelName);

    const onSlotUpdated = (_payload: SlotUpdatedPayload) => {
      void queryClient.invalidateQueries({
        queryKey: ["slots", input.doctorId],
      });
    };

    channel.bind("slot-updated", onSlotUpdated);

    return () => {
      channel.unbind("slot-updated", onSlotUpdated);
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [input.doctorId, input.enabled, queryClient]);
}
