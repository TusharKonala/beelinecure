/** Standard VARCHAR(255) — typical production cap for a single address field. */
export const PATIENT_ADDRESS_MAX_CHARS = 255;
/** Standard short professional bio (e.g. directory / profile summaries). */
export const DOCTOR_BIO_MAX_CHARS = 500;
/** Brief optional admin scheduling notes. */
export const INTERVIEW_NOTES_MAX_CHARS = 250;
/** Required reason when cancelling an interview. */
export const INTERVIEW_CANCELLATION_REASON_MAX_CHARS = 250;

export function countChars(text: string): number {
  return text.length;
}

export function isOverCharLimit(text: string, max: number): boolean {
  return text.length > max;
}

export function isWithinCharLimit(
  text: string | null | undefined,
  max: number,
): boolean {
  if (text == null || text === "") return true;
  return text.length <= max;
}

export function charLimitErrorMessage(label: string, max: number): string {
  return `${label} must be ${max} characters or fewer.`;
}

export function withinCharLimitRefine(max: number) {
  return (value: string | null | undefined) => isWithinCharLimit(value, max);
}
