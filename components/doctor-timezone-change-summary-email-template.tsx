import * as React from "react";
import type { DoctorHolidaySummaryItem } from "@/components/doctor-holiday-summary-email-template";
import { formatDoctorDisplayName } from "@/lib/doctor-name";

export interface DoctorTimezoneChangeSummaryEmailProps {
  doctorName: string;
  oldTimezone: string;
  newTimezone: string;
  appointmentsByDate: Record<string, DoctorHolidaySummaryItem[]>;
}

/**
 * Email sent to the doctor summarising appointments cancelled after a
 * practice timezone change. Sent from `lib/doctor-timezone-change-summary-email.ts`.
 */
export function DoctorTimezoneChangeSummaryEmailTemplate({
  doctorName,
  oldTimezone,
  newTimezone,
  appointmentsByDate,
}: DoctorTimezoneChangeSummaryEmailProps) {
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
        Timezone change: appointments cancelled
      </h1>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        Hello {displayDoctorName},
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        You changed your practice timezone from <strong>{oldTimezone}</strong>{" "}
        to <strong>{newTimezone}</strong>.
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        We cancelled <strong>{totalCount}</strong> upcoming appointment
        {totalCount === 1 ? "" : "s"} that {totalCount === 1 ? "was" : "were"}{" "}
        booked in <strong>{oldTimezone}</strong>. Those times cannot be carried
        over after a timezone change, so patients were notified to book again in
        your new timezone. Refunds were initiated where applicable.
      </p>
      <p style={{ color: "#333333", lineHeight: 1.6 }}>
        Appointment times below are shown exactly as they were booked (
        {oldTimezone}).
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
          <ul
            style={{
              marginTop: "0.5rem",
              paddingLeft: "1.25rem",
              color: "#333333",
            }}
          >
            {items.map((item, idx) => (
              <li key={idx} style={{ marginBottom: "0.4rem", lineHeight: 1.5 }}>
                <strong>{item.appointmentTime}</strong> · {item.patientName} (
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
        You don&apos;t need to do anything. This email is for your records.
      </p>
    </div>
  );
}
