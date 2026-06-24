import * as React from "react";

export type InterviewCancellationInitiator = "admin" | "interviewer";

export interface CareersInterviewCancelledCandidateEmailProps {
  candidateName: string;
  jobTitle: string;
  roundNumber: number;
  scheduledAtLabel: string;
  cancellationReason: string;
  cancelledBy: InterviewCancellationInitiator;
  interviewerName?: string | null;
}

function cancellationNoteIntro(
  cancelledBy: InterviewCancellationInitiator,
  interviewerName?: string | null,
): string {
  if (cancelledBy === "interviewer") {
    const name = interviewerName?.trim();
    return name
      ? `Your interviewer, ${name}, shared this note:`
      : "Your interviewer shared this note:";
  }
  return "Our team shared this note:";
}

export function CareersInterviewCancelledCandidateEmailTemplate({
  candidateName,
  jobTitle,
  roundNumber,
  scheduledAtLabel,
  cancellationReason,
  cancelledBy,
  interviewerName,
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
        {cancellationNoteIntro(cancelledBy, interviewerName)}
      </p>
      <p
        style={{
          color: "#333333",
          lineHeight: 1.6,
          marginTop: "0.5rem",
          marginBottom: "0.5rem",
          paddingLeft: "1rem",
          borderLeft: "3px solid #e5e5e5",
          fontStyle: "italic",
        }}
      >
        {cancellationReason}
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        Thank you for your interest in BeelineCure. If you have questions, please
        reply to this email.
      </p>
    </div>
  );
}
