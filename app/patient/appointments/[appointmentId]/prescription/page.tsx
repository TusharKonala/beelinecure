import { getServerSession } from "next-auth/next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Container } from "@/components/layout/Container";
import { PrescriptionPreviewClient } from "@/components/prescription/PrescriptionPreviewClient";
import { prisma } from "@/lib/db";

type PageProps = {
  params: Promise<{ appointmentId: string }>;
};

export default async function PatientPrescriptionDownloadPage({ params }: PageProps) {
  const { appointmentId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    const callbackUrl = `/patient/appointments/${encodeURIComponent(appointmentId)}/prescription`;
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  let appointment: {
    id: string;
    patientName: string;
    date: Date;
    time: string;
    timezone: string;
    doctor: { name: string };
    prescription: { medicines: unknown; generalNotes: string | null } | null;
  } | null = null;
  try {
    appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        email: {
          equals: session.user.email,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        patientName: true,
        date: true,
        time: true,
        timezone: true,
        doctor: {
          select: {
            name: true,
          },
        },
        prescription: {
          select: {
            medicines: true,
            generalNotes: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("[patient-prescription] Failed to load prescription:", error);
    return (
      <div className="w-full bg-[#fafafa] py-6 md:py-8">
        <Container>
          <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="font-montaga text-2xl font-semibold text-[#333333] md:text-3xl">
              Prescription unavailable
            </h1>
            <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
              We could not load your prescription right now. Please try again in a moment.
            </p>
            <Link
              href="/patient/appointments?tab=completed"
              className="mt-4 inline-block font-montserrat text-sm font-medium text-[#2555F3]"
            >
              Back to appointments
            </Link>
          </section>
        </Container>
      </div>
    );
  }

  if (!appointment?.prescription) {
    return (
      <div className="w-full bg-[#fafafa] py-6 md:py-8">
        <Container>
          <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="font-montaga text-2xl font-semibold text-[#333333] md:text-3xl">
              Prescription not available
            </h1>
            <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
              This prescription is either unavailable or linked to a different account.
            </p>
            <Link
              href="/patient/appointments?tab=completed"
              className="mt-4 inline-block font-montserrat text-sm font-medium text-[#2555F3]"
            >
              Back to appointments
            </Link>
          </section>
        </Container>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
          <h1 className="font-montaga text-2xl font-semibold text-[#333333] md:text-3xl">
            Prescription
          </h1>
          <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
            Review your prescription and download if needed.
          </p>
          <div className="mt-6">
            <PrescriptionPreviewClient
              doctorName={appointment.doctor.name}
              patientName={appointment.patientName}
              date={appointment.date.toISOString().slice(0, 10)}
              time={appointment.time}
              timezone={appointment.timezone}
              prescription={{
                medicines: appointment.prescription.medicines,
                generalNotes: appointment.prescription.generalNotes,
              }}
              backHref="/patient/appointments?tab=completed"
            />
          </div>
        </section>
      </Container>
    </div>
  );
}
