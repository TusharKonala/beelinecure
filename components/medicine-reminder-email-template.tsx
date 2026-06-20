import * as React from "react";
import { formatDoctorDisplayName } from "@/lib/doctor-name";

export interface MedicineReminderEmailTemplateProps {
  heading: string;
  message: React.ReactNode;
  doctorName: string;
  patientName: string;
  primaryActionLabel: string;
  primaryActionUrl: string;
  secondaryActionLabel?: string;
  secondaryActionUrl?: string;
}

export function MedicineReminderEmailTemplate({
  heading,
  message,
  doctorName,
  patientName,
  primaryActionLabel,
  primaryActionUrl,
  secondaryActionLabel,
  secondaryActionUrl,
}: MedicineReminderEmailTemplateProps) {
  const displayDoctorName = formatDoctorDisplayName(doctorName);

  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>{heading}</h1>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>Hello {patientName},</p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>{message}</p>

      <div
        style={{
          marginTop: "1.5rem",
          padding: "1rem",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          border: "1px solid #e5e5e5",
        }}
      >
        <p style={{ margin: "0.25rem 0", color: "#111111" }}>
          <strong>Doctor:</strong> {displayDoctorName}
        </p>
        <p style={{ margin: "0.25rem 0", color: "#111111" }}>
          <strong>Patient:</strong> {patientName}
        </p>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <a
          href={primaryActionUrl}
          style={{
            color: "#2555F3",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {primaryActionLabel}
        </a>
      </div>

      {secondaryActionLabel && secondaryActionUrl && (
        <div style={{ marginTop: "0.75rem" }}>
          <a
            href={secondaryActionUrl}
            style={{
              color: "#2555F3",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {secondaryActionLabel}
          </a>
        </div>
      )}

      <p
        style={{ color: "#5E5E5E", fontSize: "0.875rem", marginTop: "1.5rem" }}
      >
        Thank you for choosing our clinic.
      </p>
    </div>
  );
}
