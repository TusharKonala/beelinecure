export const STAFF_CANCEL_ALREADY_CANCELLED_CODE = "ALREADY_CANCELLED" as const;

export function isAlreadyCancelledCancelResponse(
  status: number,
  body: { code?: string; error?: string },
): boolean {
  if (status !== 409) return false;
  if (body.code === STAFF_CANCEL_ALREADY_CANCELLED_CODE) return true;
  const message = (body.error ?? "").toLowerCase();
  return message.includes("already cancelled");
}

export function alreadyCancelledCancelMessage(body: {
  error?: string;
}): string {
  return body.error?.trim() || "This appointment was already cancelled.";
}
