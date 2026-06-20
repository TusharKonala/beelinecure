export function formatDoctorDisplayName(name: string | null | undefined): string {
  const trimmedName = name?.trim() ?? "";
  if (!trimmedName) return "Doctor";

  return /^dr\.?\s+/i.test(trimmedName)
    ? trimmedName.replace(/^dr\.?\s+/i, "Dr. ")
    : `Dr. ${trimmedName}`;
}

export function formatDoctorDisplayNameOrFallback(
  name: string | null | undefined,
  fallback = "Your Doctor",
): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  return formatDoctorDisplayName(trimmed);
}

/** Patient-facing display when the value may already be a generic label like "Your Doctor". */
export function formatDoctorNameForDisplay(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || /^your doctor$/i.test(trimmed)) {
    return trimmed || "Your Doctor";
  }
  return formatDoctorDisplayName(trimmed);
}

/**
 * Canonical persisted doctor name (e.g. signup): same rules as {@link formatDoctorDisplayName},
 * using `fallbackLocalPart` (typically email local part) when `name` is empty.
 */
export function formatDoctorStoredName(
  name: string | undefined,
  fallbackLocalPart: string,
): string {
  const raw = (name?.trim() || fallbackLocalPart.trim() || "Doctor").trim();
  return formatDoctorDisplayName(raw);
}
