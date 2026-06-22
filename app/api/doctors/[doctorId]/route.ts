import { prisma } from "@/lib/db";
import { serializePublicDoctorProfile } from "@/lib/doctor-online-booking";
import { publicDoctorByIdWhere } from "@/lib/doctor-visibility";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ doctorId: string }> },
) {
  const { doctorId } = await params;
  const doctor = await prisma.doctor.findFirst({
    where: publicDoctorByIdWhere(doctorId),
    select: {
      id: true,
      name: true,
      slug: true,
      specialization: true,
      qualification: true,
      yearsExperience: true,
      bio: true,
      profilePhotoUrl: true,
      timezone: true,
      slotDurationMinutes: true,
      consultationPriceCentsByDuration: true,
      currency: true,
      averageRating: true,
      reviewCount: true,
      googleCalendarRefreshToken: true,
    },
  });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }
  return NextResponse.json(serializePublicDoctorProfile(doctor));
}
