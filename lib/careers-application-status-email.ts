import { Resend } from "resend";
import { CareersApplicationRejectedEmailTemplate } from "@/components/careers-application-rejected-email-template";
import { CareersApplicationShortlistedEmailTemplate } from "@/components/careers-application-shortlisted-email-template";
import { ApplicationStatus } from "@/generated/prisma/client";
import { getEmailFrom } from "@/lib/email-from";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendApplicationStatusChangeEmail(params: {
  status: ApplicationStatus;
  to: string;
  candidateName: string;
  jobTitle: string;
}) {
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(
      "[careers-application-status] RESEND_API_KEY not set; skipping email",
    );
    return;
  }

  if (params.status === ApplicationStatus.SHORTLISTED) {
    await resend.emails.send({
      from: getEmailFrom(),
      to: params.to,
      subject: `Application update — ${params.jobTitle}`,
      react: CareersApplicationShortlistedEmailTemplate({
        candidateName: params.candidateName,
        jobTitle: params.jobTitle,
      }),
    });
    return;
  }

  if (params.status === ApplicationStatus.REJECTED) {
    await resend.emails.send({
      from: getEmailFrom(),
      to: params.to,
      subject: `Application update — ${params.jobTitle}`,
      react: CareersApplicationRejectedEmailTemplate({
        candidateName: params.candidateName,
        jobTitle: params.jobTitle,
      }),
    });
  }
}
