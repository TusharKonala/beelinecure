export type PrescriptionMedicine = {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions: string;
};

export type StructuredPrescription = {
  medicines: PrescriptionMedicine[];
  generalNotes?: string | null;
};

function normalizeRichText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(trimmed);
  if (!looksLikeHtml) {
    return trimmed;
  }

  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(
        `<div class="rx-root">${trimmed}</div>`,
        "text/html",
      );
      const root = doc.querySelector(".rx-root");
      if (root) {
        return (root as HTMLElement).innerText
          .replace(/\r\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
    } catch {
      // fall through to regex fallback
    }
  }

  return trimmed
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, "\n\n")
    .replace(/<\/(li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Converts prescription content into PDF-friendly plain text.
 * Supports both legacy text prescriptions and structured medicines JSON.
 */
export function prescriptionToPlainTextForPdf(raw: string | StructuredPrescription): string {
  if (typeof raw === "string") {
    return normalizeRichText(raw);
  }

  if (!Array.isArray(raw.medicines) || raw.medicines.length === 0) return "";
  const medicineSections = raw.medicines.map((medicine, index) => {
    const lines = [
      `${index + 1}. ${medicine.name}`,
      `Dosage: ${medicine.dosage}`,
      `Frequency: ${medicine.frequency}`,
      `Duration: ${medicine.durationDays} day${medicine.durationDays === 1 ? "" : "s"}`,
    ];
    const instructions = medicine.instructions.trim();
    if (instructions) {
      lines.push(`Instructions: ${instructions}`);
    }
    return lines.join("\n");
  });

  if (raw.generalNotes?.trim()) {
    medicineSections.push(`General notes: ${raw.generalNotes.trim()}`);
  }

  return medicineSections.join("\n\n");
}
