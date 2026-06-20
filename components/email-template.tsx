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
  padding: "7px 12px",
  backgroundColor: "#2555F3",
  color: "#ffffff",
  textDecoration: "none",
  fontWeight: 600,
  borderRadius: "6px",
  fontSize: "13px",
  lineHeight: 1.3,
};

const secondaryButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 12px",
  backgroundColor: "#ffffff",
  color: "#2555F3",
  textDecoration: "none",
  fontWeight: 600,
  borderRadius: "6px",
  fontSize: "13px",
  lineHeight: 1.3,
  border: "1px solid #2555F3",
};

const emailActionResponsiveStyles = `
  .bc-email-action-row-item {
    display: inline-block;
    vertical-align: middle;
    margin-right: 0.5rem;
  }
  @media only screen and (max-width: 480px) {
    .bc-email-action-row-item {
      display: block !important;
      margin-right: 0 !important;
      margin-top: 0.5rem !important;
    }
    .bc-email-action-row-item.bc-email-action-row-first {
      margin-top: 0 !important;
    }
  }
`;

function EmailActionButton({
  href,
  label,
  variant,
  isFirst,
  rowItemClassName,
}: {
  href: string;
  label: string;
  variant: "primary" | "secondary";
  isFirst?: boolean;
  rowItemClassName?: string;
}) {
  const isRowItem = Boolean(rowItemClassName);

  return (
    <span
      className={rowItemClassName}
      style={{
        display: isRowItem ? undefined : "block",
        marginTop: isFirst ? 0 : isRowItem ? undefined : "0.5rem",
      }}
    >
      <a
        href={href}
        style={variant === "primary" ? primaryButtonStyle : secondaryButtonStyle}
      >
        {label}
      </a>
    </span>
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
      <style>{emailActionResponsiveStyles}</style>
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>{heading}</h1>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>Hello {patientName},</p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        {" "}
        {message ?? getConfirmationMessage(consultationType)}
      </p>
      {showActionLinks && (
        <div style={{ marginTop: "1rem" }}>
          {showMeetButton && meetLink && (
            <EmailActionButton
              href={meetLink}
              label="Join Google Meet"
              variant="primary"
              isFirst
            />
          )}
          {usesDefaultPatientActions ? (
            <div style={{ marginTop: showMeetButton ? "0.5rem" : 0 }}>
              {secondActionUrl && (
                <EmailActionButton
                  href={secondActionUrl}
                  label={secondActionLabel}
                  variant="primary"
                  isFirst
                  rowItemClassName="bc-email-action-row-item bc-email-action-row-first"
                />
              )}
              {firstActionUrl && (
                <EmailActionButton
                  href={firstActionUrl}
                  label={firstActionLabel}
                  variant={
                    secondActionUrl || showMeetButton ? "secondary" : "primary"
                  }
                  isFirst={!secondActionUrl}
                  rowItemClassName={
                    secondActionUrl
                      ? "bc-email-action-row-item"
                      : "bc-email-action-row-item bc-email-action-row-first"
                  }
                />
              )}
            </div>
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
