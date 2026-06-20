import * as React from "react";
import { formatDoctorNameForDisplay } from "@/lib/doctor-name";

export interface EmailTemplateProps {
  heading?: string;
  message?: React.ReactNode;
  showActionLinks?: boolean;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  patientName: string;
  consultationType: "CLINIC" | "ONLINE";
  cancelUrl: string;
  rescheduleUrl: string;
  /** Google Meet join URL for online consultations when available. */
  meetLink?: string | null;
  /** Formatted price in the doctor's currency, e.g. "₹1,500.00". */
  priceLabel?: string | null;
  /** Optional approx local-currency equivalent, e.g. "(approx $18.07)". */
  approxLocalPriceLabel?: string | null;
  /** Whether the shown price has already been paid. */
  isPricePaid?: boolean;
  primaryActionLabel?: string;
  primaryActionUrl?: string;
  secondaryActionLabel?: string;
  secondaryActionUrl?: string;
  showOnlineContactFallback?: boolean;
}

const getConfirmationMessage = (consultationType: "CLINIC" | "ONLINE") => {
  if (consultationType === "ONLINE") {
    return "Your online appointment is confirmed. Please be available at the scheduled time. To cancel or reschedule, use the links below.";
  }

  return "Your appointment is confirmed. Please arrive a few minutes early. To cancel or reschedule, use the links below.";
};

export function EmailTemplate({
  heading = "Appointment Confirmation",
  message,
  showActionLinks = true,
  doctorName,
  appointmentDate,
  appointmentTime,
  patientName,
  consultationType,
  cancelUrl,
  rescheduleUrl,
  meetLink,
  priceLabel,
  approxLocalPriceLabel,
  isPricePaid = false,
  primaryActionLabel,
  primaryActionUrl,
  secondaryActionLabel,
  secondaryActionUrl,
  showOnlineContactFallback = true,
}: EmailTemplateProps) {
  const firstActionLabel = primaryActionLabel ?? "Cancel Appointment";
  const firstActionUrl = primaryActionUrl ?? cancelUrl;
  const secondActionLabel = secondaryActionLabel ?? "Reschedule Appointment";
  const secondActionUrl = secondaryActionUrl ?? rescheduleUrl;
  const displayDoctorName = formatDoctorNameForDisplay(doctorName);

  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>{heading}</h1>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>Hello {patientName},</p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        {" "}
        {message ?? getConfirmationMessage(consultationType)}
      </p>
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
          <strong>Date:</strong> {appointmentDate}
        </p>
        <p style={{ margin: "0.25rem 0", color: "#111111" }}>
          <strong>Time:</strong> {appointmentTime}
        </p>
        <p style={{ margin: "0.25rem 0", color: "#111111" }}>
          <strong>Patient:</strong> {patientName}
        </p>
        <p style={{ margin: "0.25rem 0", color: "#111111" }}>
          <strong>Consultation Type:</strong>{" "}
          {consultationType === "ONLINE"
            ? "Online Consultation"
            : "Clinic Visit"}
        </p>
        {priceLabel ? (
          <p style={{ margin: "0.25rem 0", color: "#111111" }}>
            <strong>Price:</strong> {priceLabel}
            {approxLocalPriceLabel ? ` ${approxLocalPriceLabel}` : ""}
            {isPricePaid ? " (Paid)" : ""}
          </p>
        ) : null}
      </div>
      {consultationType === "ONLINE" && showActionLinks && meetLink && (
        <p style={{ marginTop: "1rem", color: "#333" }}>
          <strong>Join Google Meet:</strong>{" "}
          <a
            href={meetLink}
            style={{
              color: "#2555F3",
              wordBreak: "break-all",
            }}
          >
            {meetLink}
          </a>
        </p>
      )}
      {consultationType === "ONLINE" &&
        showActionLinks &&
        showOnlineContactFallback &&
        !meetLink && (
        <p style={{ marginTop: "1rem", color: "#333" }}>
          This is an online consultation. The doctor will contact you at the
          scheduled time.
        </p>
      )}
      {showActionLinks && (
        <>
          {firstActionLabel && firstActionUrl && (
            <div style={{ marginTop: "1rem" }}>
              <a
                href={firstActionUrl}
                style={{
                  color: "#2555F3",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                {firstActionLabel}
              </a>
            </div>
          )}
          {secondActionLabel && secondActionUrl && (
            <div style={{ marginTop: "0.75rem" }}>
              <a
                href={secondActionUrl}
                style={{
                  color: "#2555F3",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                {secondActionLabel}
              </a>
            </div>
          )}
        </>
      )}
      <p
        style={{ color: "#5E5E5E", fontSize: "0.875rem", marginTop: "1.5rem" }}
      >
        Thank you for choosing our clinic.
      </p>
    </div>
  );
}
