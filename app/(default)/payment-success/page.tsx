import { Container } from "@/components/layout/Container";
import { PostAppointmentActions } from "@/components/PostAppointmentActions";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import {
  formatDateInPatientTz,
  formatTimeInPatientTz,
} from "@/lib/timezone-display";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { ReschedulePolicyNotice } from "@/app/(default)/book-appointment/components/ReschedulePolicyNotice";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

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

  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const metadata = session.metadata ?? {};
      const bookingSessionId = metadata.bookingSessionId;

      const bookingSession = bookingSessionId
        ? await prisma.bookingSession.findUnique({
            where: { id: bookingSessionId },
            include: { doctor: { select: { name: true } } },
          })
        : null;

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
      } else {
        if (metadata.date) appointmentDate = metadata.date;
        if (metadata.time) appointmentTime = metadata.time;
        if (metadata.patientName) patientName = metadata.patientName;
        if (metadata.email) patientEmail = metadata.email;
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
  const confirmationMessage = isOnline
    ? "Your online consultation has been confirmed. A confirmation email has been sent to your inbox."
    : "Your appointment has been confirmed. A confirmation email has been sent to your inbox. Please arrive a few minutes early.";

  return (
    <div className="w-full bg-[#fafafa] py-10 md:py-14 lg:py-16">
      <Container>
        <section className="mx-auto max-w-xl">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
              Payment successful
            </h1>
            <p className="mt-3 font-montserrat text-sm text-[#5E5E5E] md:text-base">
              Payment successful.
            </p>
            <p className="mt-2 font-montserrat text-sm text-[#5E5E5E] md:text-base">
              {confirmationMessage}
            </p>
            {isOnline && (
              <p className="mt-2 font-montserrat text-sm text-[#5E5E5E] md:text-base">
                A Google Meet link has been sent to your email. If you&apos;re
                signed in, you can also find it in your appointments dashboard.
              </p>
            )}
            <ReschedulePolicyNotice className="mt-4" />
            {hasDetails ? (
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
            ) : (
              <p className="mt-6 font-montserrat text-sm text-[#5E5E5E]">
                We could not load the full appointment details, but your payment
                was successful.
              </p>
            )}

            <PostAppointmentActions emailHint={patientEmail} />
          </div>
        </section>
      </Container>
    </div>
  );
}
