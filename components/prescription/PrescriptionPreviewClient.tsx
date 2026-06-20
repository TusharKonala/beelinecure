"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { createPrescriptionPdfBlobUrl, downloadPrescriptionPdf } from "@/lib/prescription-pdf";
import { type StructuredPrescription } from "@/lib/prescription-pdf-text";

type PrescriptionPreviewClientProps = {
  doctorName: string;
  patientName: string;
  date: string;
  time: string;
  timezone: string;
  prescription: {
    medicines: unknown;
    generalNotes: string | null;
  };
  backHref: string;
  backLabel?: string;
};

function normalizePrescription(raw: {
  medicines: unknown;
  generalNotes: string | null;
}): StructuredPrescription {
  const medicines = Array.isArray(raw.medicines)
    ? raw.medicines.filter((item) => !!item && typeof item === "object").map((item) => {
        const entry = item as Record<string, unknown>;
        return {
          name: String(entry.name ?? "").trim(),
          dosage: String(entry.dosage ?? "").trim(),
          frequency: String(entry.frequency ?? "").trim(),
          durationDays: Number(entry.durationDays ?? 0),
          instructions: String(entry.instructions ?? "").trim(),
        };
      })
    : [];
  return {
    medicines: medicines.filter(
      (m) =>
        m.name &&
        m.dosage &&
        m.frequency &&
        Number.isInteger(m.durationDays) &&
        m.durationDays > 0,
    ),
    generalNotes: raw.generalNotes,
  };
}

export function PrescriptionPreviewClient({
  doctorName,
  patientName,
  date,
  time,
  timezone,
  prescription,
  backHref,
  backLabel = "Back to appointments",
}: PrescriptionPreviewClientProps) {
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isMobilePreviewFallback, setIsMobilePreviewFallback] = useState(false);
  const normalizedPrescription = useMemo(
    () => normalizePrescription(prescription),
    [prescription],
  );
  const displayDoctorName = useMemo(
    () => formatDoctorDisplayName(doctorName),
    [doctorName],
  );

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    setIsMobilePreviewFallback(/Android|iPhone|iPad|iPod|Mobile/i.test(ua));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function preparePreview() {
      setIsPreparingPreview(true);
      setPreviewError(null);
      try {
        const url = await createPrescriptionPdfBlobUrl({
          doctorName: displayDoctorName,
          patientName,
          date,
          time,
          timezone,
          prescription: normalizedPrescription,
        });
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreviewUrl(url);
      } catch {
        if (!cancelled) {
          setPreviewError("Could not render PDF preview.");
          setPreviewUrl(null);
        }
      } finally {
        if (!cancelled) {
          setIsPreparingPreview(false);
        }
      }
    }

    void preparePreview();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [displayDoctorName, patientName, date, time, timezone, normalizedPrescription]);

  async function downloadPdf() {
    setIsDownloading(true);
    try {
      await downloadPrescriptionPdf({
        doctorName: displayDoctorName,
        patientName,
        date,
        time,
        timezone,
        prescription: normalizedPrescription,
      });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#fafafa]">
        {isPreparingPreview ? (
          <div className="p-4 font-montserrat text-sm text-[#5E5E5E]">
            Preparing prescription preview...
          </div>
        ) : previewError ? (
          <div className="p-4 font-montserrat text-sm text-red-600">{previewError}</div>
        ) : previewUrl ? (
          isMobilePreviewFallback ? (
            <div className="space-y-4 bg-white p-4 sm:p-6">
              <div className="rounded-lg border border-[#e5e5e5] bg-[#fcfcfc] p-4">
                <p className="font-montaga text-lg font-semibold text-[#333333]">
                  Prescription Preview
                </p>
                <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
                  Review your prescription details below. You can still download the PDF any
                  time.
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-[#e5e5e5] bg-[#fcfcfc] p-4 font-montserrat text-sm text-[#333333]">
                <p>
                  <span className="font-semibold">Doctor:</span> {displayDoctorName}
                </p>
                <p>
                  <span className="font-semibold">Patient:</span> {patientName}
                </p>
                <p>
                  <span className="font-semibold">Date:</span> {date}
                </p>
              </div>
              <div className="space-y-3">
                {normalizedPrescription.medicines.map((medicine, index) => (
                  <div
                    key={`${medicine.name}-${index}`}
                    className="rounded-lg border border-[#e5e5e5] bg-[#fcfcfc] p-4"
                  >
                    <p className="font-montserrat text-sm font-semibold text-[#333333]">
                      {index + 1}. {medicine.name}
                    </p>
                    <div className="mt-2 space-y-1 font-montserrat text-sm text-[#5E5E5E]">
                      <p>
                        <span className="font-semibold text-[#333333]">Dosage:</span>{" "}
                        {medicine.dosage}
                      </p>
                      <p>
                        <span className="font-semibold text-[#333333]">Frequency:</span>{" "}
                        {medicine.frequency}
                      </p>
                      <p>
                        <span className="font-semibold text-[#333333]">Duration:</span>{" "}
                        {medicine.durationDays} day{medicine.durationDays === 1 ? "" : "s"}
                      </p>
                    </div>
                    {medicine.instructions.trim() && (
                      <p className="mt-3 font-montserrat text-sm text-[#333333]">
                        <span className="font-semibold">Instructions:</span>{" "}
                        {medicine.instructions}
                      </p>
                    )}
                  </div>
                ))}
                {normalizedPrescription.generalNotes && (
                  <div className="rounded-lg border border-[#e5e5e5] bg-[#fcfcfc] p-4">
                    <p className="font-montserrat text-sm font-semibold text-[#333333]">
                      General notes
                    </p>
                    <p className="mt-2 whitespace-pre-wrap font-montserrat text-sm text-[#333333]">
                      {normalizedPrescription.generalNotes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <iframe
              title="Prescription PDF preview"
              src={previewUrl}
              className="h-[70vh] w-full bg-white"
            />
          )
        ) : (
          <div className="p-4 font-montserrat text-sm text-[#5E5E5E]">
            No preview available.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="cursor-pointer rounded-xl font-montserrat"
          onClick={() => void downloadPdf()}
          disabled={isDownloading}
        >
          {isDownloading ? "Preparing PDF..." : "Download prescription PDF"}
        </Button>
        <Button
          type="button"
          className="cursor-pointer rounded-xl font-montserrat"
          onClick={() => router.push(backHref)}
        >
          {backLabel}
        </Button>
      </div>
    </div>
  );
}
