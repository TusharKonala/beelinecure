import {
  RESCHEDULE_POLICY_APPLIES_TO_LINE,
  RESCHEDULE_POLICY_HOW_TO_PRE_BOOKING_LINE,
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
        {RESCHEDULE_POLICY_HOW_TO_PRE_BOOKING_LINE}
      </p>
      <p className="mt-2 font-montserrat text-xs text-[#5E5E5E]">
        {RESCHEDULE_POLICY_APPLIES_TO_LINE}
      </p>
    </div>
  );
}
