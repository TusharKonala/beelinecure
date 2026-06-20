import * as React from "react";
import { formatDoctorDisplayName } from "@/lib/doctor-name";

export interface DoctorHolidaySummaryItem {
  patientName: string;
  /** Patient-facing time string already formatted in the doctor's timezone. */
  appointmentTime: string;
  /** "Online" or "In-clinic" — pre-formatted by the caller. */
  consultationLabel: string;
  patientEmail: string;
  patientPhone: string | null;
}

export interface DoctorHolidaySummaryEmailProps {
  doctorName: string;
  /** Affected dates pre-formatted in the doctor's timezone (e.g. "Mon, Jul 8, 2026"). */
  dateLabels: string[];
  doctorTimezone: string;
  appointmentsByDate: Record<string, DoctorHolidaySummaryItem[]>;
}

/**
 * Email sent to the doctor summarising appointments cancelled because the
 * doctor marked the day(s) as a holiday. Sent from
 * `lib/doctor-holiday-summary-email.ts` after each appointment has been
 * cancelled (which already emails the affected patients individually).
 */
export function DoctorHolidaySummaryEmailTemplate({
  doctorName,
  dateLabels,
  doctorTimezone,
  appointmentsByDate,
}: DoctorHolidaySummaryEmailProps) {
  const displayDoctorName = formatDoctorDisplayName(doctorName);
  const totalCount = Object.values(appointmentsByDate).reduce(
    (acc, list) => acc + list.length,
    0,
  );

  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: "640px", margin: "0 auto" }}
    >
      <h1 style={{ color: "#111111", marginBottom: "1rem" }}>
        Holiday cancellation summary
      </h1>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>Hello {displayDoctorName},</p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        You marked the following date{dateLabels.length === 1 ? "" : "s"} as a
        holiday: <strong>{dateLabels.join(", ")}</strong>.
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        We cancelled <strong>{totalCount}</strong> appointment
        {totalCount === 1 ? "" : "s"} and notified the affected patient
        {totalCount === 1 ? "" : "s"} by email. Where applicable, refunds were
        initiated automatically. Times below are shown in your timezone (
        {doctorTimezone}).
      </p>

      {Object.entries(appointmentsByDate).map(([dateLabel, items]) => (
        <div
          key={dateLabel}
          style={{
            marginTop: "1.25rem",
            padding: "1rem",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
            border: "1px solid #e5e5e5",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#111111",
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            {dateLabel} · {items.length} appointment
            {items.length === 1 ? "" : "s"}
          </p>
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem", color: "#333333" }}>
            {items.map((item, idx) => (
              <li key={idx} style={{ marginBottom: "0.4rem", lineHeight: 1.5 }}>
                <strong>{item.appointmentTime}</strong> — {item.patientName} (
                {item.consultationLabel})
                <br />
                <span style={{ color: "#5E5E5E", fontSize: "0.9rem" }}>
                  {item.patientEmail}
                  {item.patientPhone ? ` · ${item.patientPhone}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p
        style={{ color: "#5E5E5E", fontSize: "0.875rem", marginTop: "1.5rem" }}
      >
        You don&apos;t need to do anything — this is for your records.
      </p>
    </div>
  );
}
