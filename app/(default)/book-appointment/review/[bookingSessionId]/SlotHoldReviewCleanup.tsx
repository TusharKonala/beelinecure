"use client";

import { useEffect } from "react";
import { SLOT_HOLD_STORAGE_KEY } from "@/lib/slot-hold-shared";

/** Release a stale book-page hold once the patient reaches review (BookingSession holds the slot). */
export function SlotHoldReviewCleanup() {
  useEffect(() => {
    const holdId = sessionStorage.getItem(SLOT_HOLD_STORAGE_KEY);
    if (!holdId) return;

    void fetch("/api/slot-hold", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdId }),
    })
      .catch(() => {})
      .finally(() => {
        sessionStorage.removeItem(SLOT_HOLD_STORAGE_KEY);
      });
  }, []);

  return null;
}
