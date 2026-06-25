export type InterviewRoundForHireCheck = {
  isCompleted: boolean;
};

export const HIRE_BLOCKED_INCOMPLETE_INTERVIEWS_MESSAGE =
  "At least one completed interview is required before marking this applicant as hired.";

export function canMarkApplicationAsHired(
  rounds: InterviewRoundForHireCheck[],
): boolean {
  return rounds.length > 0 && rounds.every((r) => r.isCompleted);
}

export function buildOfferEmailSubject(jobTitle: string): string {
  return `Job offer — ${jobTitle} at BeelineCure`;
}

export function buildOfferEmailBody(params: {
  candidateName: string;
  jobTitle: string;
}): string {
  return `Dear ${params.candidateName},

We are pleased to offer you the position of ${params.jobTitle} at BeelineCure.

Please find the key details below:

Role: ${params.jobTitle}
Start date: [Start Date]
Compensation: [Salary]

We were impressed with your interviews and believe you would be a great addition to our team. Please review this offer and let us know if you have any questions.

We look forward to hearing from you.

Best regards,
[Your Name]
BeelineCure`;
}

export function buildGmailComposeUrl(params: {
  to: string;
  subject: string;
  body: string;
}): string {
  const search = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: params.to,
    su: params.subject,
    body: params.body,
  });
  return `https://mail.google.com/mail/?${search.toString()}`;
}
