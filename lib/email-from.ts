const DEFAULT_EMAIL_FROM = "BeelineCure <noreply@beelinecure.com>";

export function getEmailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;
}
