export function CancellationRefundPolicyNotice({
  className = "mt-6",
}: {
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-4 ${className}`}
    >
      <p className="font-montserrat text-sm font-semibold text-[#111111]">
        Cancellation & refund policy
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 font-montserrat text-sm text-[#5E5E5E]">
        <li>
          Cancel 24 or more hours before your appointment for a full refund.
        </li>
        <li>
          Cancel within 24 hours of your appointment for a 50% refund.
        </li>
        <li>
          If the doctor cancels or is unavailable, you receive a full refund.
        </li>
        <li>No-shows are not eligible for a refund.</li>
      </ul>
      <p className="mt-2 font-montserrat text-xs text-[#5E5E5E]">
        Refunds are issued to your original payment method and typically arrive
        within 5-10 business days.
      </p>
    </div>
  );
}
