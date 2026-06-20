const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MIN_RESUME_CHARS = 50;
export const MAX_RESUME_CHARS = 5000;

export type ExtractPdfErrorCode =
  | "invalid_type"
  | "too_large"
  | "no_text"
  | "parse_failed";

export class ExtractPdfError extends Error {
  readonly code: ExtractPdfErrorCode;

  constructor(code: ExtractPdfErrorCode, message: string) {
    super(message);
    this.name = "ExtractPdfError";
    this.code = code;
  }
}

let workerConfigured = false;

function isPdfFile(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }
  return pdfjs;
}

function normalizeExtractedText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function extractTextFromPdfFile(file: File): Promise<string> {
  if (!isPdfFile(file)) {
    throw new ExtractPdfError(
      "invalid_type",
      "Please upload a PDF file (.pdf).",
    );
  }

  if (file.size > MAX_PDF_BYTES) {
    throw new ExtractPdfError(
      "too_large",
      "PDF must be 5 MB or smaller.",
    );
  }

  let pdfjs: Awaited<ReturnType<typeof getPdfJs>>;
  try {
    pdfjs = await getPdfJs();
  } catch {
    throw new ExtractPdfError(
      "parse_failed",
      "Could not load PDF reader. Please try again.",
    );
  }

  let pdf: import("pdfjs-dist").PDFDocumentProxy;

  try {
    const data = await file.arrayBuffer();
    pdf = await pdfjs.getDocument({ data }).promise;
  } catch {
    throw new ExtractPdfError(
      "parse_failed",
      "Could not read this PDF. It may be password-protected or corrupted.",
    );
  }

  const parts: string[] = [];
  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      if (pageText.trim()) {
        parts.push(pageText);
      }
    }
  } catch {
    throw new ExtractPdfError(
      "parse_failed",
      "Could not extract text from this PDF.",
    );
  }

  const normalized = normalizeExtractedText(parts.join(" "));
  if (normalized.length < MIN_RESUME_CHARS) {
    throw new ExtractPdfError(
      "no_text",
      "Could not extract enough text from this PDF. Use a text-based PDF (not a scan) and provide your resume link below.",
    );
  }

  return normalized.length > MAX_RESUME_CHARS
    ? normalized.slice(0, MAX_RESUME_CHARS)
    : normalized;
}

export function extractPdfErrorMessage(err: unknown): string {
  if (err instanceof ExtractPdfError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Could not process this PDF. Please try another file.";
}
