import * as React from "react";
import { CareersInterviewJdEmailBlock } from "@/components/careers-interview-jd-email-block";

export interface CareersInterviewAttendeeConfirmedEmailProps {
  attendeeName: string;
  candidateName: string;
  jobTitle: string;
  roundNumber: number;
  scheduledAtLabel: string;
  meetLink: string | null;
  jobDescription?: string | null;
  cancelUrl?: string | null;
}

export function CareersInterviewAttendeeConfirmedEmailTemplate({
  attendeeName,
  candidateName,
  jobTitle,
  roundNumber,
  scheduledAtLabel,
  meetLink,
  jobDescription,
  cancelUrl,
}: CareersInterviewAttendeeConfirmedEmailProps) {
  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "640px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>
        Career interview scheduled
      </h1>
      <p style={{ color: "#333333", lineHeight: 1.6, fontStyle: "normal" }}>
        Hi {attendeeName},
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        <strong>Round {roundNumber}</strong> for <strong>{jobTitle}</strong> with{" "}
        <strong>{candidateName}</strong> is confirmed for:
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6, fontWeight: 600 }}>
        {scheduledAtLabel}
      </p>
      {!meetLink ? (
        <p style={{ color: "#5e5e5e", lineHeight: 1.6 }}>
          The meeting link will be shared when available.
        </p>
      ) : null}
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        Join the Google Meet link at the scheduled time. The candidate has been
        notified with the same details.
      </p>
      <CareersInterviewJdEmailBlock jobDescription={jobDescription} />
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
      {cancelUrl ? (
        <p style={{ marginTop: "1.5rem", color: "#5e5e5e", lineHeight: 1.6, fontSize: "14px" }}>
          Need to cancel?{" "}
          <a href={cancelUrl} style={{ color: "#b42318", fontWeight: 600 }}>
            Cancel this interview
          </a>
        </p>
      ) : null}
    </div>
  );
}
