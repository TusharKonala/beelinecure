import { getServerSession } from "next-auth/next";
import { MyScheduleClient } from "./MyScheduleClient";
import { authOptions } from "@/lib/auth";
import { getDoctorAccessStatus } from "@/lib/doctor-access-status";

export default async function DoctorMySchedulePage() {
  const session = await getServerSession(authOptions);
  const access = session?.user?.id
    ? await getDoctorAccessStatus(session.user.id)
    : null;
  const scheduleReadOnly =
    access?.found === true && access.isActive === false;

  return <MyScheduleClient scheduleReadOnly={scheduleReadOnly} />;
}
