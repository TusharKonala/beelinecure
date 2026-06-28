"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Pusher from "pusher-js";
import type { AvailabilityChangedPayload } from "@/lib/pusher-server";
import type { SlotUpdatedPayload } from "@/lib/slot-hold-shared";

export type SlotsPusherQueryKeys = {
  slots: readonly unknown[];
  availableDates: readonly unknown[];
};

export function useDoctorSlotsPusher(input: {
  doctorId: string;
  enabled: boolean;
  queryKeys: SlotsPusherQueryKeys;
  shouldIgnoreSlotUpdate?: (payload: SlotUpdatedPayload) => boolean;
}) {
  const queryClient = useQueryClient();
  const shouldIgnoreSlotUpdate = input.shouldIgnoreSlotUpdate;
  const slotsQueryKey = input.queryKeys.slots;
  const availableDatesQueryKey = input.queryKeys.availableDates;

  useEffect(() => {
    if (!input.enabled || !input.doctorId) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });
    const channelName = `doctor-slots-${input.doctorId}`;
    const channel = pusher.subscribe(channelName);

    const onSlotUpdated = (payload: SlotUpdatedPayload) => {
      if (shouldIgnoreSlotUpdate?.(payload)) return;
      void queryClient.invalidateQueries({ queryKey: slotsQueryKey });
    };

    const onAvailabilityChanged = (_payload: AvailabilityChangedPayload) => {
      void queryClient.invalidateQueries({ queryKey: slotsQueryKey });
      void queryClient.invalidateQueries({ queryKey: availableDatesQueryKey });
    };

    channel.bind("slot-updated", onSlotUpdated);
    channel.bind("availability-changed", onAvailabilityChanged);

    return () => {
      channel.unbind("slot-updated", onSlotUpdated);
      channel.unbind("availability-changed", onAvailabilityChanged);
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [
    input.doctorId,
    input.enabled,
    queryClient,
    shouldIgnoreSlotUpdate,
    slotsQueryKey,
    availableDatesQueryKey,
  ]);
}
