import * as React from "react";

export interface CareersInterviewRescheduledCandidateEmailProps {
  candidateName: string;
  jobTitle: string;
  roundNumber: number;
  previousScheduledAtLabel: string;
  scheduledAtLabel: string;
  meetLink: string | null;
}

export function CareersInterviewRescheduledCandidateEmailTemplate({
  candidateName,
  jobTitle,
  roundNumber,
  previousScheduledAtLabel,
  scheduledAtLabel,
  meetLink,
}: CareersInterviewRescheduledCandidateEmailProps) {
  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "640px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>
        Interview rescheduled
      </h1>
      <p style={{ color: "#333333", lineHeight: 1.6, fontStyle: "normal" }}>
        Hi {candidateName},
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        Your <strong>Round {roundNumber}</strong> interview for{" "}
        <strong>{jobTitle}</strong> has been rescheduled.
      </p>
      <p style={{ color: "#5e5e5e", lineHeight: 1.6 }}>
        Previous time: {previousScheduledAtLabel}
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6, fontWeight: 600 }}>
        New time: {scheduledAtLabel}
      </p>
      {meetLink ? (
        <>
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
          <p style={{ color: "#333333", lineHeight: 1.6 }}>
            Join the Google Meet link at the new scheduled time.
          </p>
        </>
      ) : (
        <p style={{ color: "#333333", lineHeight: 1.6, marginTop: "1rem" }}>
          Please use your confirmation link if you have not yet confirmed this
          time.
        </p>
      )}
    </div>
  );
}
