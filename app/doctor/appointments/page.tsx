import { UserRole } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Container } from "@/components/layout/Container";
import DoctorAppointmentsClient from "./DoctorAppointmentsClient";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

export default function DoctorAppointmentsPage() {
  return <DoctorAppointmentsPageContent />;
}

async function DoctorAppointmentsPageContent() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/doctor/appointments");
  }
  if (session.user.role !== UserRole.DOCTOR) {
    redirect("/");
  }

  const doctor = await prisma.doctor.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!doctor) {
    redirect("/");
  }

  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <DoctorAppointmentsClient doctorId={doctor.id} />
      </Container>
    </div>
  );
}
