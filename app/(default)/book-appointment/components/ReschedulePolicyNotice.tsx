import { RESCHEDULE_POLICY_CONFIRMATION_LINE } from "@/lib/reschedule-policy-copy";

export function ReschedulePolicyNotice({ className = "mt-6" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-4 ${className}`}
    >
      <p className="font-montserrat text-sm font-semibold text-[#111111]">
        Reschedule policy
      </p>
      <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
        {RESCHEDULE_POLICY_CONFIRMATION_LINE}
      </p>
    </div>
  );
}
