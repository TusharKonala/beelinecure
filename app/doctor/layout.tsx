import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getDoctorAccessStatus } from "@/lib/doctor-access-status";
import { DoctorShell } from "./DoctorShell";

export default async function DoctorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // Middleware already guarantees an authenticated DOCTOR with APPROVED status
  // before reaching `/doctor/*`. The DB check below adds the deactivation gate:
  // a deactivated doctor with no remaining work is fully locked out, while one
  // with unfinished appointments (upcoming or pending review) still gets read-only access.
  if (userId) {
    const access = await getDoctorAccessStatus(userId);
    if (access.found && !access.isActive && !access.hasRemainingAppointments) {
      redirect("/auth/doctor-deactivated");
    }
    const doctorIsActive = access.found ? access.isActive : true;
    const initialDoctorName = access.found ? access.doctorName : "Doctor";
    return (
      <DoctorShell
        doctorIsActive={doctorIsActive}
        initialDoctorName={initialDoctorName}
      >
        {children}
      </DoctorShell>
    );
  }

  return (
    <DoctorShell doctorIsActive={true} initialDoctorName="Doctor">
      {children}
    </DoctorShell>
  );
}
