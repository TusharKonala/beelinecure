"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/Container";

type CancelUiState =
  | "idle"
  | "success"
  | "invalid_link"
  | "interview_started"
  | "already_cancelled"
  | "error";

type CancelPreview = {
  jobTitle: string;
  candidateName: string;
  roundNumber: number;
  scheduledAtLabel: string;
};

function InterviewerCancelContent() {
  const searchParams = useSearchParams();
  const token = useMemo(
    () => searchParams.get("token") ?? "",
    [searchParams],
  );

  const [state, setState] = useState<CancelUiState>("idle");
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [hasCheckedStatus, setHasCheckedStatus] = useState(false);

  const canSubmit = token.length > 0;

  useEffect(() => {
    if (!canSubmit) {
      setHasCheckedStatus(true);
      setState("invalid_link");
      return;
    }

    fetch(
      `/api/careers/interview/attendee-cancel?token=${encodeURIComponent(token)}`,
    )
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as
          | ({ status?: string } & Partial<CancelPreview>)
          | null;

        const nextState = json?.status;
        if (
          nextState === "already_cancelled" ||
          nextState === "invalid_link" ||
          nextState === "interview_started"
        ) {
          setState(nextState);
          setPreview(null);
          return;
        }

        if (nextState !== "valid") {
          setState("error");
          setPreview(null);
          return;
        }

        setPreview({
          jobTitle: json?.jobTitle ?? "",
          candidateName: json?.candidateName ?? "",
          roundNumber: json?.roundNumber ?? 0,
          scheduledAtLabel: json?.scheduledAtLabel ?? "",
        });
      })
      .catch(() => {
        setState("error");
        setPreview(null);
      })
      .finally(() => setHasCheckedStatus(true));
  }, [token, canSubmit]);

  async function onConfirmCancel() {
    if (!canSubmit || isCancelling) return;
    setIsCancelling(true);
    try {
      const res = await fetch(
        `/api/careers/interview/attendee-cancel?token=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      const json = (await res.json().catch(() => null)) as
        | { status?: string }
        | null;

      const nextState = json?.status;
      if (
        nextState === "success" ||
        nextState === "already_cancelled" ||
        nextState === "invalid_link" ||
        nextState === "interview_started"
      ) {
        setState(nextState);
        return;
      }
      setState("error");
    } catch {
      setState("error");
    } finally {
      setIsCancelling(false);
    }
  }

  const title = (() => {
    switch (state) {
      case "success":
        return "Interview cancelled";
      case "already_cancelled":
        return "Already cancelled";
      case "invalid_link":
        return "Invalid link";
      case "interview_started":
        return "Link expired";
      case "error":
        return "Cancellation error";
      default:
        return "Cancel this interview";
    }
  })();

  const message = (() => {
    switch (state) {
      case "success":
        return "This interview has been cancelled. The candidate and admin have been notified.";
      case "already_cancelled":
        return "This interview has already been cancelled.";
      case "invalid_link":
        return "This cancellation link is invalid or expired.";
      case "interview_started":
        return "This interview has already started. This link can no longer be used to cancel.";
      case "error":
        return "We could not cancel this interview. Please try again.";
      default:
        if (canSubmit && !hasCheckedStatus) {
          return "Checking your cancellation link...";
        }
        if (preview) {
          return `Cancel Round ${preview.roundNumber} for ${preview.jobTitle} with ${preview.candidateName}? Scheduled for ${preview.scheduledAtLabel}.`;
        }
        return "Are you sure you want to cancel this interview?";
    }
  })();

  return (
    <div className="flex flex-1 flex-col w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
      <Container>
        <section className="mx-auto max-w-xl">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
              {title}
            </h1>
            <p className="mt-4 font-montserrat text-sm text-[#5E5E5E] md:text-base">
              {message}
            </p>

            {state === "idle" && canSubmit && hasCheckedStatus && preview && (
              <div className="mt-8">
                <Button
                  disabled={isCancelling}
                  onClick={() => void onConfirmCancel()}
                  className="h-11 w-full cursor-pointer rounded-xl bg-[#b42318] font-montserrat text-sm font-medium hover:bg-[#912018] sm:h-12 md:text-base"
                >
                  {isCancelling ? "Cancelling…" : "Cancel interview"}
                </Button>
              </div>
            )}

            {(state === "success" || state === "already_cancelled") && (
              <p className="mt-8 font-montserrat text-sm text-[#5E5E5E] md:text-base">
                You can close this page.
              </p>
            )}
          </div>
        </section>
      </Container>
    </div>
  );
}

export default function InterviewerCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
          <Container>
            <section className="mx-auto max-w-xl">
              <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
                <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
                  Loading…
                </h1>
              </div>
            </section>
          </Container>
        </div>
      }
    >
      <InterviewerCancelContent />
    </Suspense>
  );
}
