/** Same-origin relative post-login path; rejects open redirects. */
export function safeCallbackPath(raw: string | undefined | null): string {
  if (!raw || raw.length === 0) return "/patient/overview";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/patient/overview";
  return raw;
}
