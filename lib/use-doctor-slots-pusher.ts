"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Pusher from "pusher-js";
import type { AvailabilityChangedPayload } from "@/lib/pusher-server";
import type { SlotUpdatedPayload } from "@/lib/slot-hold-shared";

export type SlotsPusherQueryKeys = {
  slots: readonly unknown[];
  availableDates: readonly unknown[];
};

export type UseDoctorSlotsPusherInput = {
  doctorId: string;
  enabled: boolean;
  queryKeys: SlotsPusherQueryKeys;
  shouldIgnoreSlotUpdate?: (payload: SlotUpdatedPayload) => boolean;
  onAvailabilityChanged?: (payload: AvailabilityChangedPayload) => void;
  /** Extra side effect on every (non-ignored) slot-updated event. */
  onSlotUpdated?: (payload: SlotUpdatedPayload) => void;
  /**
   * Distinct doctor-local YMD dates currently shown in the slot grid. When
   * provided, slot refetches are scoped to events touching one of these dates
   * (or a global availability regen), so edits to an unrelated day no longer
   * refetch the visible grid. When `undefined`, every event invalidates
   * (legacy behavior). An empty array means the grid currently shows no slots;
   * in that case `availability-changed` still refetches (cheap) so newly added
   * slots on the viewed day surface.
   */
  currentDoctorDates?: readonly string[] | null;
};

export function useDoctorSlotsPusher(input: UseDoctorSlotsPusherInput) {
  const queryClient = useQueryClient();

  // Keep the latest props in a ref so frequently-changing values
  // (e.g. currentDoctorDates, inline callbacks) don't tear down and
  // re-create the Pusher subscription on every render.
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (!input.enabled || !input.doctorId) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });
    const channelName = `doctor-slots-${input.doctorId}`;
    const channel = pusher.subscribe(channelName);

    const onSlotUpdated = (payload: SlotUpdatedPayload) => {
      const current = inputRef.current;
      if (current.shouldIgnoreSlotUpdate?.(payload)) return;
      current.onSlotUpdated?.(payload);

      const dates = current.currentDoctorDates;
      const inScope = dates == null || dates.includes(payload.date);
      if (inScope) {
        void queryClient.invalidateQueries({
          queryKey: current.queryKeys.slots,
        });
      }
    };

    const onAvailabilityChanged = (payload: AvailabilityChangedPayload) => {
      const current = inputRef.current;
      void queryClient.invalidateQueries({
        queryKey: current.queryKeys.availableDates,
      });

      const dates = current.currentDoctorDates;
      const shouldInvalidateSlots =
        dates == null || // legacy: no scoping info
        payload.dates.length === 0 || // global regen (e.g. slot duration change)
        dates.length === 0 || // empty grid: cheap refetch surfaces new slots
        payload.dates.some((d) => dates.includes(d));
      if (shouldInvalidateSlots) {
        void queryClient.invalidateQueries({
          queryKey: current.queryKeys.slots,
        });
      }

      current.onAvailabilityChanged?.(payload);
    };

    channel.bind("slot-updated", onSlotUpdated);
    channel.bind("availability-changed", onAvailabilityChanged);

    return () => {
      channel.unbind("slot-updated", onSlotUpdated);
      channel.unbind("availability-changed", onAvailabilityChanged);
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [input.doctorId, input.enabled, queryClient]);
}
