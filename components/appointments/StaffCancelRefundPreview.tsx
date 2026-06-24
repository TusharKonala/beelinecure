"use client";

export type StaffCancelRefundPreviewData = {
  percentage: 100 | 50 | 0;
  title: string;
  description: string;
  originalPaidAmountCents: number | null;
  eligibleRefundAmountCents: number | null;
  currency: string | null;
  equivalentAmountCents?: number | null;
  equivalentCurrency?: string | null;
};

type StaffCancelRefundPreviewProps = {
  loading: boolean;
  refundPreview: StaffCancelRefundPreviewData | null;
  cancelReason: "patient_no_show" | "doctor_unavailable" | null;
  formatRefundCents: (cents: number, currency: string | null) => string;
  showEquivalentCurrency?: boolean;
  normaliseCurrencyCode?: (code: string | null | undefined) => string;
};

export function StaffCancelRefundPreview({
  loading,
  refundPreview,
  cancelReason,
  formatRefundCents,
  showEquivalentCurrency = false,
  normaliseCurrencyCode,
}: StaffCancelRefundPreviewProps) {
  if (loading) {
    return (
      <p className="font-montserrat text-sm text-[#5E5E5E]">
        Checking refund eligibility…
      </p>
    );
  }

  if (!refundPreview) {
    return (
      <p className="font-montserrat text-sm text-[#5E5E5E]">
        No refund applies (appointment was not paid).
      </p>
    );
  }

  if (cancelReason === "patient_no_show" || refundPreview.percentage === 0) {
    return (
      <p className="font-montserrat text-sm text-[#333333]">
        No refund: cancelled as patient no-show.
      </p>
    );
  }

  const showEquivalent =
    showEquivalentCurrency &&
    typeof refundPreview.equivalentAmountCents === "number" &&
    refundPreview.equivalentCurrency &&
    normaliseCurrencyCode &&
    normaliseCurrencyCode(refundPreview.currency) !==
      normaliseCurrencyCode(refundPreview.equivalentCurrency);

  return (
    <>
      <p className="font-montserrat text-sm font-semibold text-[#111111]">
        Refund eligibility: {refundPreview.title}
      </p>
      <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
        {refundPreview.description}
      </p>
      {typeof refundPreview.originalPaidAmountCents === "number" &&
        typeof refundPreview.eligibleRefundAmountCents === "number" &&
        (refundPreview.percentage === 100 ? (
          <p className="mt-1 font-montserrat text-sm text-[#333333]">
            Patient paid{" "}
            {formatRefundCents(
              refundPreview.originalPaidAmountCents,
              refundPreview.currency,
            )}
            . Eligible refund:{" "}
            {formatRefundCents(
              refundPreview.originalPaidAmountCents,
              refundPreview.currency,
            )}
            {showEquivalent ? (
              <>
                {" "}
                (
                {formatRefundCents(
                  refundPreview.equivalentAmountCents!,
                  refundPreview.equivalentCurrency ?? null,
                )}
                )
              </>
            ) : null}{" "}
            (100%).
          </p>
        ) : (
          <p className="mt-1 font-montserrat text-sm text-[#333333]">
            Patient paid{" "}
            {formatRefundCents(
              refundPreview.originalPaidAmountCents,
              refundPreview.currency,
            )}
            . Eligible refund:{" "}
            {formatRefundCents(
              refundPreview.eligibleRefundAmountCents,
              refundPreview.currency,
            )}
            {showEquivalent ? (
              <>
                {" "}
                (
                {formatRefundCents(
                  refundPreview.equivalentAmountCents!,
                  refundPreview.equivalentCurrency ?? null,
                )}
                )
              </>
            ) : null}{" "}
            ({refundPreview.percentage}%).
          </p>
        ))}
    </>
  );
}
