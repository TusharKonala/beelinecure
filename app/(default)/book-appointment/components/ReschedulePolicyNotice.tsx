import Link from "next/link";
import {
  RESCHEDULE_POLICY_APPLIES_TO_LINE,
  RESCHEDULE_POLICY_TIMING_LINE,
} from "@/lib/reschedule-policy-copy";

export function ReschedulePolicyNotice({ className = "mt-6" }: { className?: string }) {
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
        After your appointment is confirmed, reschedule from the{" "}
        <strong>Reschedule</strong> link in your confirmation email, or sign in
        to your{" "}
        <Link
          href="/patient/appointments"
          className="font-medium text-[#2555F3] underline underline-offset-2"
        >
          appointments dashboard
        </Link>{" "}
        (use the same email you used when booking).
      </p>
      <p className="mt-2 font-montserrat text-xs text-[#5E5E5E]">
        {RESCHEDULE_POLICY_APPLIES_TO_LINE}
      </p>
    </div>
  );
}
