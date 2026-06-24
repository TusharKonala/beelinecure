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
  /** When true, show Join Google Meet for ONLINE appointments even if showActionLinks is false. */
  showMeetLink?: boolean;
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
  /** Intro line before an optional staff cancellation note. */
  staffNoteIntro?: string | null;
  /** Free-text note from doctor or admin shown to the patient on cancellation. */
  staffNote?: string | null;
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
  @media only screen and (max-width: 480px) {
    .bc-email-action-pair-cell {
      display: block !important;
      width: 100% !important;
      padding-right: 0 !important;
    }
    .bc-email-action-pair-cell-first {
      padding-bottom: 8px !important;
    }
  }
`;

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
    <span
      style={{
        display: "block",
        marginTop: isFirst ? 0 : "0.5rem",
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

function EmailActionPair({
  firstHref,
  firstLabel,
  firstVariant,
  secondHref,
  secondLabel,
  secondVariant,
}: {
  firstHref: string;
  firstLabel: string;
  firstVariant: "primary" | "secondary";
  secondHref: string;
  secondLabel: string;
  secondVariant: "primary" | "secondary";
}) {
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: "collapse" }}
    >
      <tbody>
        <tr>
          <td
            className="bc-email-action-pair-cell bc-email-action-pair-cell-first"
            style={{
              paddingRight: "10px",
              paddingBottom: "0",
              verticalAlign: "middle",
            }}
          >
            <a href={firstHref} style={firstVariant === "primary" ? primaryButtonStyle : secondaryButtonStyle}>
              {firstLabel}
            </a>
          </td>
          <td
            className="bc-email-action-pair-cell"
            style={{ verticalAlign: "middle" }}
          >
            <a href={secondHref} style={secondVariant === "primary" ? primaryButtonStyle : secondaryButtonStyle}>
              {secondLabel}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
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
  showMeetLink = false,
  priceLabel,
  approxLocalPriceLabel,
  isPricePaid = false,
  primaryActionLabel,
  primaryActionUrl,
  secondaryActionLabel,
  secondaryActionUrl,
  showOnlineContactFallback = true,
  staffNoteIntro,
  staffNote,
}: EmailTemplateProps) {
  const firstActionLabel = primaryActionLabel ?? "Cancel Appointment";
  const firstActionUrl = primaryActionUrl ?? cancelUrl;
  const secondActionLabel = secondaryActionLabel ?? "Reschedule Appointment";
  const secondActionUrl = secondaryActionUrl ?? rescheduleUrl;
  const displayDoctorName = formatDoctorNameForDisplay(doctorName);
  const usesDefaultPatientActions =
    primaryActionLabel === undefined && primaryActionUrl === undefined;
  const showMeetButton =
    consultationType === "ONLINE" &&
    !!meetLink &&
    (showActionLinks || showMeetLink);

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
      {staffNoteIntro && staffNote ? (
        <>
          <p style={{ color: "#333333", lineHeight: 1.6, marginTop: "1rem" }}>
            {staffNoteIntro}
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
            {staffNote}
          </p>
        </>
      ) : null}
      {showMeetButton && meetLink && (
        <div style={{ marginTop: "1rem" }}>
          <EmailActionButton
            href={meetLink}
            label="Join Google Meet"
            variant="primary"
            isFirst
          />
        </div>
      )}
      {showActionLinks && (
        <div style={{ marginTop: showMeetButton ? "0.5rem" : "1rem" }}>
          {usesDefaultPatientActions ? (
            <div>
              {secondActionUrl && firstActionUrl ? (
                <EmailActionPair
                  firstHref={secondActionUrl}
                  firstLabel={secondActionLabel}
                  firstVariant="primary"
                  secondHref={firstActionUrl}
                  secondLabel={firstActionLabel}
                  secondVariant="secondary"
                />
              ) : (
                <>
                  {secondActionUrl && (
                    <EmailActionButton
                      href={secondActionUrl}
                      label={secondActionLabel}
                      variant="primary"
                      isFirst
                    />
                  )}
                  {firstActionUrl && (
                    <EmailActionButton
                      href={firstActionUrl}
                      label={firstActionLabel}
                      variant="primary"
                      isFirst={!secondActionUrl}
                    />
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {firstActionUrl && firstActionLabel && (
                <EmailActionButton
                  href={firstActionUrl}
                  label={firstActionLabel}
                  variant="primary"
                  isFirst
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
