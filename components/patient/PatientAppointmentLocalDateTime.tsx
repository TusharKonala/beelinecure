"use client";

import {
  formatDateInPatientTz,
  formatTimeInPatientTz,
} from "@/lib/timezone-display";

type Props = {
  date: string;
  time: string;
  doctorTimezone: string;
  className?: string;
};

export function PatientAppointmentLocalDateTime({
  date,
  time,
  doctorTimezone,
  className,
}: Props) {
  return (
    <span className={className}>
      {formatDateInPatientTz(date, time, doctorTimezone)} ·{" "}
      {formatTimeInPatientTz(date, time, doctorTimezone)}
    </span>
  );
}
