import { getServerSession } from "next-auth/next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { PrescriptionPreviewClient } from "@/components/prescription/PrescriptionPreviewClient";
import { UserRole } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type PageProps = {
  params: Promise<{ appointmentId: string }>;
  searchParams: Promise<{ from?: string }>;
};

function doctorBackNav(from: string | undefined): { href: string; label: string } {
  if (from === "prescriptions") {
    return { href: "/doctor/prescriptions", label: "Back to prescriptions" };
  }
  if (from === "appointments") {
    return { href: "/doctor/appointments?tab=completed", label: "Back to appointments" };
  }
  return { href: "/doctor/appointments", label: "Back to appointments" };
}

export default async function DoctorPrescriptionPreviewPage({ params, searchParams }: PageProps) {
  const { appointmentId } = await params;
  const { from } = await searchParams;
  const backNav = doctorBackNav(from);
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const callbackUrl = `/doctor/prescriptions/${encodeURIComponent(appointmentId)}/view`;
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  if (session.user.role !== UserRole.DOCTOR) {
    redirect("/");
  }

  const doctor = await prisma.doctor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, name: true },
  });
  if (!doctor) {
    redirect(backNav.href);
  }

  let appointment: {
    id: string;
    patientName: string;
    date: Date;
    time: string;
    timezone: string;
    prescription: { medicines: unknown; generalNotes: string | null } | null;
  } | null = null;
  try {
    appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        doctorId: doctor.id,
      },
      select: {
        id: true,
        patientName: true,
        date: true,
        time: true,
        timezone: true,
        prescription: {
          select: {
            medicines: true,
            generalNotes: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("[doctor-prescription-preview] Failed to load prescription:", error);
    return (
      <div className="w-full bg-[#fafafa] py-6 md:py-8">
        <Container>
          <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
            <h1 className="font-montaga text-2xl font-semibold text-[#333333] md:text-3xl">
              Prescription unavailable
            </h1>
            <p className="mt-2 font-montserrat text-sm text-[#5E5E5E]">
              We could not load this prescription right now. Please try again in a moment.
            </p>
            <Link
              href={backNav.href}
              className="mt-4 inline-block font-montserrat text-sm font-medium text-[#2555F3]"
            >
              {backNav.label}
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
              This appointment does not have a prescription yet.
            </p>
            <Link
              href={backNav.href}
              className="mt-4 inline-block font-montserrat text-sm font-medium text-[#2555F3]"
            >
              {backNav.label}
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
            Review this prescription and download if needed.
          </p>
          <div className="mt-6">
            <PrescriptionPreviewClient
              doctorName={doctor.name}
              patientName={appointment.patientName}
              date={appointment.date.toISOString().slice(0, 10)}
              time={appointment.time}
              timezone={appointment.timezone}
              prescription={{
                medicines: appointment.prescription.medicines,
                generalNotes: appointment.prescription.generalNotes,
              }}
              backHref={backNav.href}
              backLabel={backNav.label}
            />
          </div>
        </section>
      </Container>
    </div>
  );
}
