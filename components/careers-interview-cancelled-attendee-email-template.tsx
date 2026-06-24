import * as React from "react";

export interface CareersInterviewCancelledAttendeeEmailProps {
  attendeeName: string;
  candidateName: string;
  jobTitle: string;
  roundNumber: number;
  scheduledAtLabel: string;
  cancellationReason: string;
}

export function CareersInterviewCancelledAttendeeEmailTemplate({
  attendeeName,
  candidateName,
  jobTitle,
  roundNumber,
  scheduledAtLabel,
  cancellationReason,
}: CareersInterviewCancelledAttendeeEmailProps) {
  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "640px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>
        Interview cancelled
      </h1>
      <p style={{ color: "#333333", lineHeight: 1.6, fontStyle: "normal" }}>
        Hi {attendeeName},
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        The <strong>Round {roundNumber}</strong> interview for{" "}
        <strong>{jobTitle}</strong> with <strong>{candidateName}</strong>{" "}
        scheduled for <strong>{scheduledAtLabel}</strong> has been cancelled.
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        <strong>Reason for cancellation:</strong> {cancellationReason}
      </p>
    </div>
  );
}
