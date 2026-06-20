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

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 20px",
  backgroundColor: "#2555F3",
  color: "#ffffff",
  textDecoration: "none",
  fontWeight: 600,
  borderRadius: "8px",
  fontSize: "14px",
};

const secondaryButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 20px",
  backgroundColor: "#ffffff",
  color: "#2555F3",
  textDecoration: "none",
  fontWeight: 600,
  borderRadius: "8px",
  fontSize: "14px",
  border: "1px solid #2555F3",
};

function EmailActionButton({
  href,
  label,
  variant,
  isFirst,
}: {
  href: string;
  label: string;
  variant: "primary" | "secondary";
  isFirst?: boolean;
}) {
  return (
    <div style={{ marginTop: isFirst ? 0 : "0.75rem" }}>
      <a
        href={href}
        style={variant === "primary" ? primaryButtonStyle : secondaryButtonStyle}
      >
        {label}
      </a>
    </div>
  );
}

const getConfirmationMessage = (consultationType: "CLINIC" | "ONLINE") => {
  if (consultationType === "ONLINE") {
    return "Your online appointment is confirmed. Please be available at the scheduled time. Use the buttons below to manage your appointment.";
  }

  return "Your appointment is confirmed. Please arrive a few minutes early. Use the buttons below to manage your appointment.";
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
  const usesDefaultPatientActions =
    primaryActionLabel === undefined && primaryActionUrl === undefined;
  const showMeetButton =
    consultationType === "ONLINE" && showActionLinks && !!meetLink;

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
      {showActionLinks && (
        <div style={{ marginTop: "1.5rem" }}>
          {showMeetButton && meetLink && (
            <EmailActionButton
              href={meetLink}
              label="Join Google Meet"
              variant="primary"
              isFirst
            />
          )}
          {usesDefaultPatientActions ? (
            <>
              {secondActionUrl && (
                <EmailActionButton
                  href={secondActionUrl}
                  label={secondActionLabel}
                  variant="primary"
                  isFirst={!showMeetButton}
                />
              )}
              {firstActionUrl && (
                <EmailActionButton
                  href={firstActionUrl}
                  label={firstActionLabel}
                  variant={
                    secondActionUrl || showMeetButton ? "secondary" : "primary"
                  }
                  isFirst={!showMeetButton && !secondActionUrl}
                />
              )}
            </>
          ) : (
            <>
              {firstActionUrl && firstActionLabel && (
                <EmailActionButton
                  href={firstActionUrl}
                  label={firstActionLabel}
                  variant="primary"
                  isFirst={!showMeetButton}
                />
              )}
              {secondActionUrl && secondActionLabel && (
                <EmailActionButton
                  href={secondActionUrl}
                  label={secondActionLabel}
                  variant="secondary"
                />
              )}
            </>
          )}
        </div>
      )}
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
      {consultationType === "ONLINE" &&
        showActionLinks &&
        showOnlineContactFallback &&
        !meetLink && (
          <p style={{ marginTop: "1rem", color: "#333" }}>
            This is an online consultation. The doctor will contact you at the
            scheduled time.
          </p>
        )}
      <p
        style={{ color: "#5E5E5E", fontSize: "0.875rem", marginTop: "1.5rem" }}
      >
        Thank you for choosing our clinic.
      </p>
    </div>
  );
}
