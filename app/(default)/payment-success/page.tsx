import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { PostAppointmentActions } from "@/components/PostAppointmentActions";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import {
  formatDateInPatientTz,
  formatTimeInPatientTz,
} from "@/lib/timezone-display";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { BookingSessionStatus } from "@/generated/prisma/client";
import { slotConflictRefundEmailMessage } from "@/lib/reschedule-policy-copy";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type PaymentOutcome = "confirmed" | "slot_taken" | "processing" | "unknown";

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawSessionId = params.session_id;
  const sessionId = Array.isArray(rawSessionId)
    ? rawSessionId[0]
    : rawSessionId;

  let doctorName = "Your doctor";
  let appointmentDate = "-";
  let appointmentTime = "-";
  let patientName = "-";
  let patientEmail: string | null = null;
  let consultationTypeLabel = "Clinic visit";
  let hasDetails = false;
  let outcome: PaymentOutcome = "unknown";
  let rebookDoctorId: string | null = null;

  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const metadata = session.metadata ?? {};
      const bookingSessionId = metadata.bookingSessionId;

      const [appointment, bookingSession] = await Promise.all([
        prisma.appointment.findFirst({
          where: { stripePaymentId: sessionId },
        }),
        bookingSessionId
          ? prisma.bookingSession.findUnique({
              where: { id: bookingSessionId },
              include: { doctor: { select: { name: true } } },
            })
          : Promise.resolve(null),
      ]);

      if (appointment) {
        outcome = "confirmed";
      } else if (bookingSession?.status === BookingSessionStatus.FAILED) {
        outcome = "slot_taken";
        rebookDoctorId = bookingSession.doctorId;
      } else if (session.payment_status === "paid") {
        outcome = "processing";
      }

      if (bookingSession) {
        doctorName = bookingSession.doctor?.name
          ? formatDoctorDisplayName(bookingSession.doctor.name)
          : "Your doctor";
        appointmentDate = formatDateInPatientTz(
          bookingSession.date,
          bookingSession.time,
          bookingSession.timezone,
          bookingSession.patientTimezone,
        );
        appointmentTime = formatTimeInPatientTz(
          bookingSession.date,
          bookingSession.time,
          bookingSession.timezone,
          bookingSession.patientTimezone,
        );
        patientName = bookingSession.patientName;
        patientEmail = bookingSession.email;
        consultationTypeLabel =
          bookingSession.consultationType === "ONLINE"
            ? "Online consultation"
            : "Clinic visit";
        if (!rebookDoctorId) {
          rebookDoctorId = bookingSession.doctorId;
        }
      } else {
        if (metadata.date) appointmentDate = metadata.date;
        if (metadata.time) appointmentTime = metadata.time;
        if (metadata.patientName) patientName = metadata.patientName;
        if (metadata.email) patientEmail = metadata.email;
        if (metadata.doctorId) rebookDoctorId = metadata.doctorId;
        consultationTypeLabel =
          metadata.consultationType === "ONLINE"
            ? "Online consultation"
            : "Clinic visit";
      }

      hasDetails = true;
    } catch {
      hasDetails = false;
    }
  }

  const isOnline = consultationTypeLabel === "Online consultation";

  const pageTitle =
    outcome === "slot_taken"
      ? "Time slot unavailable"
      : "Payment successful";

  const primaryMessage =
    outcome === "confirmed"
      ? isOnline
        ? "Your online consultation has been confirmed. A confirmation email has been sent to your inbox."
        : "Your appointment has been confirmed. A confirmation email has been sent to your inbox. Please arrive a few minutes early."
      : outcome === "slot_taken"
        ? slotConflictRefundEmailMessage()
        : outcome === "processing"
          ? "Your payment was successful. We are confirming your appointment — this usually takes a few seconds. Please check your email shortly."
          : "Payment successful.";

  const showMeetNote = outcome === "confirmed" && isOnline;

  return (
    <div className="flex flex-1 flex-col w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
      <Container>
        <section className="mx-auto max-w-xl">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
              {pageTitle}
            </h1>
            {outcome !== "slot_taken" && (
              <p className="mt-3 font-montserrat text-sm text-[#5E5E5E] md:text-base">
                Payment successful.
              </p>
            )}
            <p className="mt-2 font-montserrat text-sm text-[#5E5E5E] md:text-base">
              {primaryMessage}
            </p>
            {showMeetNote && (
              <p className="mt-2 font-montserrat text-sm text-[#5E5E5E] md:text-base">
                A Google Meet link has been sent to your email. If you&apos;re
                signed in, you can also find it in your appointments dashboard.
              </p>
            )}
            {hasDetails && outcome !== "processing" ? (
              <div className="mt-6 space-y-3 font-montserrat text-sm">
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                  <span className="font-medium text-[#111111]">Doctor</span>
                  <span className="text-[#333333] sm:text-right">
                    {doctorName}
                  </span>
                </div>
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                  <span className="font-medium text-[#111111]">
                    Appointment date
                  </span>
                  <span className="text-[#333333] sm:text-right">
                    {appointmentDate}
                  </span>
                </div>
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                  <span className="font-medium text-[#111111]">
                    Appointment time
                  </span>
                  <span className="text-[#333333] sm:text-right">
                    {appointmentTime}
                  </span>
                </div>
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                  <span className="font-medium text-[#111111]">Patient</span>
                  <span className="text-[#333333] sm:text-right">
                    {patientName}
                  </span>
                </div>
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                  <span className="font-medium text-[#111111]">
                    Consultation type
                  </span>
                  <span className="text-[#333333] sm:text-right">
                    {consultationTypeLabel}
                  </span>
                </div>
              </div>
            ) : outcome === "processing" ? (
              <p className="mt-6 font-montserrat text-sm text-[#5E5E5E]">
                If you do not receive a confirmation email within a few minutes,
                please contact support.
              </p>
            ) : !hasDetails ? (
              <p className="mt-6 font-montserrat text-sm text-[#5E5E5E]">
                We could not load the full appointment details, but your payment
                was successful.
              </p>
            ) : null}

            {outcome === "confirmed" && (
              <PostAppointmentActions emailHint={patientEmail} />
            )}
            {outcome === "slot_taken" && rebookDoctorId && (
              <Link
                href={`/book-appointment/${encodeURIComponent(rebookDoctorId)}`}
                className="mt-6 inline-block font-montserrat text-sm font-medium text-[#2555F3] underline underline-offset-2 hover:text-[#1a45d9]"
              >
                Choose a different time
              </Link>
            )}
          </div>
        </section>
      </Container>
    </div>
  );
}
