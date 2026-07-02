"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRedirectOverlay } from "@/components/nav/RedirectOverlayProvider";

type ConfirmAndPayButtonProps = {
  bookingSessionId: string;
  doctorId: string;
};

export function ConfirmAndPayButton({
  bookingSessionId,
  doctorId,
}: ConfirmAndPayButtonProps) {
  const { startRedirect, stopRedirect } = useRedirectOverlay();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExpired, setShowExpired] = useState(false);
  const [showCalendarUnavailable, setShowCalendarUnavailable] = useState(false);

  const handleClick = async () => {
    setError(null);
    setShowExpired(false);
    setShowCalendarUnavailable(false);
    setIsLoading(true);
    startRedirect({ manualDismiss: true, showDelayMs: 500 });

    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bookingSessionId }),
      });

      const json = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
        url?: string;
        doctorId?: string;
      } | null;

      if (!res.ok || !json?.url) {
        if (json?.code === "BOOKING_SESSION_EXPIRED") {
          setShowExpired(true);
          setIsLoading(false);
          stopRedirect();
          return;
        }
        if (json?.code === "DOCTOR_CALENDAR_NOT_CONNECTED") {
          setShowCalendarUnavailable(true);
          setIsLoading(false);
          stopRedirect();
          return;
        }
        setError(
          typeof json?.error === "string"
            ? json.error
            : "Unable to start payment. Please try again.",
        );
        setIsLoading(false);
        stopRedirect();
        return;
      }

      window.location.assign(json.url as string);
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
      stopRedirect();
    }
  };

  return (
    <div className="mt-8">
      <Button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="h-11 w-full cursor-pointer rounded-xl font-montserrat text-sm font-medium sm:h-12 md:text-base"
      >
        {isLoading ? "Redirecting…" : "Confirm & Pay"}
      </Button>
      {showExpired && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
          <p className="font-montserrat text-sm text-[#333333]">
            This booking session expired after 10 minutes. Please choose your
            slot again and start a new booking.
          </p>
          <Link
            href={`/book-appointment/${doctorId}`}
            className="mt-3 inline-block font-montserrat text-sm font-medium text-[#2555F3] underline underline-offset-2 hover:text-[#1a45d9]"
          >
            Book again
          </Link>
        </div>
      )}
      {showCalendarUnavailable && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
          <p className="font-montserrat text-sm text-[#333333]">
            This doctor is not available for online consultations right now.
            Please choose a clinic visit or start a new booking.
          </p>
          <Link
            href={`/book-appointment/${doctorId}`}
            className="mt-3 inline-block font-montserrat text-sm font-medium text-[#2555F3] underline underline-offset-2 hover:text-[#1a45d9]"
          >
            Back to booking
          </Link>
        </div>
      )}
      {error && (
        <p className="mt-3 font-montserrat text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

