import * as React from "react";

export interface CareersInterviewInviteEmailProps {
  candidateName: string;
  jobTitle: string;
  roundNumber: number;
  scheduledAtLabel: string;
  confirmUrl: string;
  notes?: string | null;
}

export function CareersInterviewInviteEmailTemplate({
  candidateName,
  jobTitle,
  roundNumber,
  scheduledAtLabel,
  confirmUrl,
  notes,
}: CareersInterviewInviteEmailProps) {
  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "640px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>
        Confirm your interview availability
      </h1>
      <p style={{ color: "#333333", lineHeight: 1.6, fontStyle: "normal" }}>
        Hi {candidateName},
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        We would like to schedule <strong>Round {roundNumber}</strong> for the{" "}
        <strong>{jobTitle}</strong> role at:
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6, fontWeight: 600 }}>
        {scheduledAtLabel}
      </p>
      {notes ? (
        <p style={{ color: "#333333", lineHeight: 1.6, fontStyle: "normal" }}>
          {notes}
        </p>
      ) : null}
      <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
        <a
          href={confirmUrl}
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
          Confirm availability
        </a>
      </div>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        Please confirm that this time works for you. Once confirmed, we will send
        you a Google Meet link for the interview.
      </p>
      <p style={{ color: "#5e5e5e", lineHeight: 1.6, fontSize: "14px" }}>
        This confirmation link expires in <strong>48 hours</strong>.
      </p>
    </div>
  );
}
