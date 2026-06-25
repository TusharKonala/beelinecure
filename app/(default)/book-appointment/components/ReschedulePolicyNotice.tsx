"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  RESCHEDULE_POLICY_APPLIES_TO_LINE,
  RESCHEDULE_POLICY_HOW_TO_AFTER_DASHBOARD,
  RESCHEDULE_POLICY_HOW_TO_BEFORE_DASHBOARD,
  RESCHEDULE_POLICY_TIMING_LINE,
} from "@/lib/reschedule-policy-copy";

const PATIENT_APPOINTMENTS_HREF = "/patient/appointments";
/** Same pattern as `app/patient/appointments/page.tsx` server redirect. */
const SIGN_IN_FOR_APPOINTMENTS_HREF =
  "/auth/signin?callbackUrl=/patient/appointments";

export function ReschedulePolicyNotice({ className = "mt-6" }: { className?: string }) {
  const { status } = useSession();
  const dashboardHref =
    status === "authenticated"
      ? PATIENT_APPOINTMENTS_HREF
      : SIGN_IN_FOR_APPOINTMENTS_HREF;

  return (
    <div
      className={`rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-4 ${className}`}
    >
      <p className="font-montserrat text-sm font-semibold text-[#111111]">
        Reschedule policy
      </p>
      <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
        {RESCHEDULE_POLICY_TIMING_LINE}
      </p>
      <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
        {RESCHEDULE_POLICY_HOW_TO_BEFORE_DASHBOARD}
        <Link
          href={dashboardHref}
          className="font-medium text-[#2555F3] underline underline-offset-2"
        >
          appointments dashboard
        </Link>
        {RESCHEDULE_POLICY_HOW_TO_AFTER_DASHBOARD}
      </p>
      <p className="mt-2 font-montserrat text-xs text-[#5E5E5E]">
        {RESCHEDULE_POLICY_APPLIES_TO_LINE}
      </p>
    </div>
  );
}
