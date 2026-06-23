import * as React from "react";

export interface CareersInterviewInterviewerCancelledAdminEmailProps {
  candidateName: string;
  candidateEmail: string;
  interviewerName: string | null;
  interviewerEmail: string | null;
  jobTitle: string;
  roundNumber: number;
  scheduledAtLabel: string;
  applicationUrl: string;
}

export function CareersInterviewInterviewerCancelledAdminEmailTemplate({
  candidateName,
  candidateEmail,
  interviewerName,
  interviewerEmail,
  jobTitle,
  roundNumber,
  scheduledAtLabel,
  applicationUrl,
}: CareersInterviewInterviewerCancelledAdminEmailProps) {
  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "640px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>
        Interview cancelled by interviewer
      </h1>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        The interviewer cancelled <strong>Round {roundNumber}</strong> for{" "}
        <strong>{jobTitle}</strong> with candidate{" "}
        <strong>{candidateName}</strong> ({candidateEmail}).
      </p>
      {interviewerName || interviewerEmail ? (
        <p style={{ color: "#333333", lineHeight: 1.6 }}>
          <strong>Interviewer:</strong>{" "}
          {interviewerName ?? "Unknown"}
          {interviewerEmail ? ` (${interviewerEmail})` : ""}
        </p>
      ) : null}
      <p style={{ color: "#333333", lineHeight: 1.6, fontWeight: 600 }}>
        Was scheduled for: {scheduledAtLabel}
      </p>
      <div style={{ marginTop: "1.5rem" }}>
        <a
          href={applicationUrl}
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
          View application
        </a>
      </div>
    </div>
  );
}
