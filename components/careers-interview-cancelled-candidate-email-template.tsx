import * as React from "react";

export interface CareersInterviewCancelledCandidateEmailProps {
  candidateName: string;
  jobTitle: string;
  roundNumber: number;
  scheduledAtLabel: string;
  cancellationReason: string;
}

export function CareersInterviewCancelledCandidateEmailTemplate({
  candidateName,
  jobTitle,
  roundNumber,
  scheduledAtLabel,
  cancellationReason,
}: CareersInterviewCancelledCandidateEmailProps) {
  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "640px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>
        Interview cancelled
      </h1>
      <p style={{ color: "#333333", lineHeight: 1.6, fontStyle: "normal" }}>
        Hi {candidateName},
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        Your <strong>Round {roundNumber}</strong> interview for{" "}
        <strong>{jobTitle}</strong> scheduled for{" "}
        <strong>{scheduledAtLabel}</strong> has been cancelled.
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        <strong>Reason for cancellation:</strong> {cancellationReason}
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        Thank you for your interest in BeelineCure. If you have questions, please
        reply to this email.
      </p>
    </div>
  );
}
