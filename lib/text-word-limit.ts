export const INTERVIEW_NOTES_MAX_WORDS = 50;
export const DOCTOR_BIO_MAX_WORDS = 100;
export const PATIENT_ADDRESS_MAX_WORDS = 50;

/** Strict word count — trim then split on whitespace (used for validation). */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/** Live display count — includes in-progress word after trailing space. */
export function countWordsLive(text: string): number {
  const strict = countWords(text);
  if (!text) return 0;
  const startingNextWord = /\S\s+$/.test(text);
  return strict + (startingNextWord ? 1 : 0);
}

export function isOverWordLimit(text: string, max: number): boolean {
  return countWords(text) > max;
}

export function isWithinWordLimit(
  text: string | null | undefined,
  max: number,
): boolean {
  if (text == null || text === "") return true;
  return countWords(text) <= max;
}

export function wordLimitErrorMessage(label: string, max: number): string {
  return `${label} must be ${max} words or fewer.`;
}

export function withinWordLimitRefine(max: number) {
  return (value: string | null | undefined) =>
    isWithinWordLimit(value, max);
}
