import {
  DoctorHolidaySummaryEmailTemplate,
  type DoctorHolidaySummaryItem,
} from "@/components/doctor-holiday-summary-email-template";
import { ConsultationType } from "@/generated/prisma/client";
import { getEmailFrom } from "@/lib/email-from";
import {
  formatDateInDoctorTz,
  formatTimeInDoctorTz,
} from "@/lib/timezone-display";
import { Resend } from "resend";

export type DoctorHolidaySummaryAppointment = {
  date: Date;
  time: string;
  patientName: string;
  email: string;
  phone: string | null;
  consultationType: ConsultationType;
};

export type DoctorHolidaySummaryDoctor = {
  name: string;
  timezone: string;
  email: string;
};

/**
 * Best-effort summary email to the doctor after holiday cancellations.
 * Failures are logged and never thrown.
 */
export async function sendDoctorHolidaySummaryEmail(input: {
  doctor: DoctorHolidaySummaryDoctor;
  appointments: DoctorHolidaySummaryAppointment[];
}): Promise<void> {
  const { doctor, appointments } = input;
  if (appointments.length === 0) return;

  const doctorEmail = doctor.email.trim();
  if (!doctorEmail || !process.env.RESEND_API_KEY) return;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const grouped: Record<string, DoctorHolidaySummaryItem[]> = {};
    for (const appt of appointments) {
      const ymdStr = appt.date.toISOString().slice(0, 10);
      const dateLabel = formatDateInDoctorTz(
        ymdStr,
        appt.time,
        doctor.timezone,
      );
      const timeLabel = formatTimeInDoctorTz(
        ymdStr,
        appt.time,
        doctor.timezone,
      );
      const list = grouped[dateLabel] ?? (grouped[dateLabel] = []);
      list.push({
        patientName: appt.patientName,
        appointmentTime: timeLabel,
        consultationLabel:
          appt.consultationType === ConsultationType.ONLINE
            ? "Online"
            : "In-clinic",
        patientEmail: appt.email,
        patientPhone: appt.phone,
      });
    }
    const dateLabels = Object.keys(grouped).sort();
    const { error: emailError } = await resend.emails.send({
      from: getEmailFrom(),
      to: doctorEmail,
      subject: `Holiday cancellation summary — ${appointments.length} appointment${appointments.length === 1 ? "" : "s"}`,
      react: DoctorHolidaySummaryEmailTemplate({
        doctorName: doctor.name,
        dateLabels,
        doctorTimezone: doctor.timezone,
        appointmentsByDate: grouped,
      }),
    });
    if (emailError) {
      console.error("[doctor-holiday-summary] Summary email failed:", emailError);
    }
  } catch (err) {
    console.error("[doctor-holiday-summary] Summary email threw:", err);
  }
}
