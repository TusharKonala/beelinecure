"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/Container";
import { useRedirectOverlay } from "@/components/nav/RedirectOverlayProvider";

export function OnboardingChoiceClient() {
  const router = useRouter();
  const { redirectWithOverlay } = useRedirectOverlay();
  const { update } = useSession();
  const [pending, setPending] = useState<"patient" | "doctor" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function continueAsPatient() {
    setPending("patient");
    setError(null);
    let didRedirect = false;
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Unable to complete onboarding.");
        return;
      }
      await update({ profileComplete: true });
      redirectWithOverlay(router, "/patient/overview", { replace: true });
      router.refresh();
      didRedirect = true;
    } finally {
      if (!didRedirect) setPending(null);
    }
  }

  async function switchToDoctorSignup() {
    setPending("doctor");
    setError(null);
    let didRedirect = false;
    try {
      const res = await fetch("/api/onboarding/doctor-intent", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirectUrl?: string;
      };
      if (!res.ok || !data.redirectUrl) {
        setError(data.error ?? "Unable to continue to doctor signup.");
        return;
      }
      await update();
      redirectWithOverlay(router, "/auth/signup?role=doctor", { replace: true });
      router.refresh();
      didRedirect = true;
    } finally {
      if (!didRedirect) setPending(null);
    }
  }

  return (
    <div className="w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
      <Container>
        <section className="mx-auto max-w-xl">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
              One quick step
            </h1>
            <p className="mt-3 font-montserrat text-sm leading-relaxed text-[#5E5E5E] md:text-base">
              You have been signed in as a patient. Are you a doctor?
            </p>

            {error && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-montserrat text-sm text-red-800">
                {error}
              </p>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                disabled={pending !== null}
                onClick={() => void continueAsPatient()}
                className="cursor-pointer h-11 rounded-xl bg-[#2555F3] font-montserrat text-sm font-medium hover:bg-[#1e44c7]"
              >
                {pending === "patient"
                  ? "Saving..."
                  : "No, continue as patient"}
              </Button>
              <Button
                type="button"
                disabled={pending !== null}
                variant="outline"
                onClick={() => void switchToDoctorSignup()}
                className="cursor-pointer h-11 rounded-xl border-[#e5e5e5] bg-white font-montserrat text-sm font-medium text-[#333333] hover:bg-[#fafafa]"
              >
                {pending === "doctor" ? "Redirecting..." : "Yes, I am a doctor"}
              </Button>
            </div>
          </div>
        </section>
      </Container>
    </div>
  );
}
