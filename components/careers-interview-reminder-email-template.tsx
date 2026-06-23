import * as React from "react";
import { CareersInterviewJdEmailBlock } from "@/components/careers-interview-jd-email-block";

export interface CareersInterviewReminderEmailProps {
  recipientName: string;
  jobTitle: string;
  roundNumber: number;
  scheduledAtLabel: string;
  meetLink: string | null;
  reminderLabel: string;
  jobDescription?: string | null;
  cancelUrl?: string | null;
}

export function CareersInterviewReminderEmailTemplate({
  recipientName,
  jobTitle,
  roundNumber,
  scheduledAtLabel,
  meetLink,
  reminderLabel,
  jobDescription,
  cancelUrl,
}: CareersInterviewReminderEmailProps) {
  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "640px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>
        Interview reminder — {reminderLabel}
      </h1>
      <p style={{ color: "#333333", lineHeight: 1.6, fontStyle: "normal" }}>
        Hi {recipientName},
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        This is a reminder that your <strong>Round {roundNumber}</strong> interview
        for <strong>{jobTitle}</strong> is scheduled for:
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6, fontWeight: 600 }}>
        {scheduledAtLabel}
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
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        Join the Google Meet link at the scheduled time. Please have a stable
        internet connection and join a few minutes early if possible.
      </p>
      <CareersInterviewJdEmailBlock jobDescription={jobDescription} />
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
