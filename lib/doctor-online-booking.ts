export const DOCTOR_CALENDAR_NOT_CONNECTED_MESSAGE =
  "This doctor is not available for online consultations right now. Please choose a clinic visit or try another doctor.";

export const DOCTOR_CALENDAR_NOT_CONNECTED_CODE =
  "DOCTOR_CALENDAR_NOT_CONNECTED";

export function isDoctorGoogleCalendarConnected(
  doctor: { googleCalendarRefreshToken: string | null } | null | undefined,
): boolean {
  return Boolean(doctor?.googleCalendarRefreshToken?.trim());
}

type PublicDoctorRow = {
  id: string;
  name: string;
  slug: string | null;
  specialization: string;
  qualification: string;
  yearsExperience: number | null;
  bio: string | null;
  profilePhotoUrl: string;
  timezone: string;
  slotDurationMinutes: number;
  consultationPriceCentsByDuration: unknown;
  currency: string;
  averageRating: number;
  reviewCount: number;
  googleCalendarRefreshToken: string | null;
};

/** Public doctor profile for patient booking — excludes OAuth tokens and internal fields. */
export function serializePublicDoctorProfile(doctor: PublicDoctorRow) {
  return {
    id: doctor.id,
    name: doctor.name,
    slug: doctor.slug,
    specialization: doctor.specialization,
    qualification: doctor.qualification,
    yearsExperience: doctor.yearsExperience,
    bio: doctor.bio,
    profilePhotoUrl: doctor.profilePhotoUrl,
    timezone: doctor.timezone,
    slotDurationMinutes: doctor.slotDurationMinutes,
    consultationPriceCentsByDuration: doctor.consultationPriceCentsByDuration,
    currency: doctor.currency,
    averageRating: doctor.averageRating,
    reviewCount: doctor.reviewCount,
    onlineConsultationAvailable: isDoctorGoogleCalendarConnected(doctor),
  };
}
