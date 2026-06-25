import * as React from "react";

export interface CareersInterviewAdminRescheduledEmailProps {
  candidateName: string;
  candidateEmail: string;
  interviewerName: string | null;
  interviewerEmail: string | null;
  jobTitle: string;
  roundNumber: number;
  previousScheduledAtLabel: string;
  scheduledAtLabel: string;
  meetLink: string | null;
  applicationUrl: string;
}

export function CareersInterviewAdminRescheduledEmailTemplate({
  candidateName,
  candidateEmail,
  interviewerName,
  interviewerEmail,
  jobTitle,
  roundNumber,
  previousScheduledAtLabel,
  scheduledAtLabel,
  meetLink,
  applicationUrl,
}: CareersInterviewAdminRescheduledEmailProps) {
  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "640px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>
        Interview rescheduled — Round {roundNumber}
      </h1>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        The <strong>Round {roundNumber}</strong> interview for{" "}
        <strong>{jobTitle}</strong> with <strong>{candidateName}</strong> (
        {candidateEmail}) has been rescheduled.
      </p>
      {interviewerName || interviewerEmail ? (
        <p style={{ color: "#333333", lineHeight: 1.6 }}>
          <strong>Interviewer:</strong> {interviewerName ?? "Unknown"}
          {interviewerEmail ? ` (${interviewerEmail})` : ""}
        </p>
      ) : null}
      <p style={{ color: "#5e5e5e", lineHeight: 1.6 }}>
        Previous time: {previousScheduledAtLabel}
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6, fontWeight: 600 }}>
        New time: {scheduledAtLabel}
      </p>
      {meetLink ? (
        <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
          <a
            href={meetLink}
            style={{
              display: "inline-block",
              padding: "12px 16px",
              backgroundColor: "#2555F3",
              color: "#ffffff",
              textDecoration: "none",
              borderRadius: "8px",
              fontWeight: 600,
            }}
          >
            Join Google Meet
          </a>
        </div>
      ) : null}
      <div style={{ marginTop: "1rem" }}>
        <a
          href={applicationUrl}
          style={{
            display: "inline-block",
            padding: "12px 16px",
            backgroundColor: "#ffffff",
            color: "#2555F3",
            textDecoration: "none",
            borderRadius: "8px",
            fontWeight: 600,
            border: "1px solid #2555F3",
          }}
        >
          View application
        </a>
      </div>
    </div>
  );
}
