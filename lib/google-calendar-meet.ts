import { addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { google } from "googleapis";
import {
  AppointmentStatus,
  ConsultationType,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { formatDoctorDisplayName } from "@/lib/doctor-name";

const CLOCK_SKEW_MS = 120_000;

function createOAuth2Client(): InstanceType<
  typeof google.auth.OAuth2
> | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret);
}

/**
 * Returns a valid access token for the given doctor's Google account,
 * refreshing and persisting when the stored token is expired.
 *
 * Returns null when the doctor has not connected Google Calendar or the
 * refresh flow fails.
 */
export async function getValidAdminAccessToken(
  userId: string,
): Promise<string | null> {
  const oauth2 = createOAuth2Client();
  if (!oauth2) {
    console.error(
      "[google-calendar] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing",
    );
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      googleCalendarAccessToken: true,
      googleCalendarRefreshToken: true,
      googleCalendarAccessTokenExpiresAt: true,
    },
  });

  if (!user?.googleCalendarRefreshToken) {
    console.warn(
      "[google-calendar] Admin has not connected Google Calendar; skipping Meet.",
      { userId },
    );
    return null;
  }

  const now = Date.now();
  const expiresAtMs = user.googleCalendarAccessTokenExpiresAt?.getTime() ?? 0;
  if (user.googleCalendarAccessToken && expiresAtMs - CLOCK_SKEW_MS > now) {
    return user.googleCalendarAccessToken;
  }

  oauth2.setCredentials({
    refresh_token: user.googleCalendarRefreshToken,
  });

  try {
    const refreshed = await oauth2.refreshAccessToken();
    const creds = refreshed.credentials;
    const accessToken = creds.access_token;
    if (!accessToken) {
      console.error(
        "[google-calendar] refreshAccessToken returned no access_token",
      );
      return null;
    }
    const newExpiry = creds.expiry_date
      ? new Date(creds.expiry_date)
      : new Date(now + 3600 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        googleCalendarAccessToken: accessToken,
        googleCalendarAccessTokenExpiresAt: newExpiry,
      },
    });

    return accessToken;
  } catch (err) {
    console.error("[google-calendar] Failed to refresh admin access token:", err);
    return null;
  }
}

export async function getValidDoctorAccessToken(
  doctorId: string,
): Promise<string | null> {
  const oauth2 = createOAuth2Client();
  if (!oauth2) {
    console.error(
      "[google-calendar] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing",
    );
    return null;
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: {
      id: true,
      googleCalendarAccessToken: true,
      googleCalendarRefreshToken: true,
      googleCalendarAccessTokenExpiresAt: true,
    },
  });

  if (!doctor?.googleCalendarRefreshToken) {
    console.warn(
      "[google-calendar] Doctor has not connected Google Calendar; skipping Meet.",
      { doctorId },
    );
    return null;
  }

  const now = Date.now();
  const expiresAtMs = doctor.googleCalendarAccessTokenExpiresAt?.getTime() ?? 0;
  if (
    doctor.googleCalendarAccessToken &&
    expiresAtMs - CLOCK_SKEW_MS > now
  ) {
    return doctor.googleCalendarAccessToken;
  }

  oauth2.setCredentials({
    refresh_token: doctor.googleCalendarRefreshToken,
  });

  try {
    const refreshed = await oauth2.refreshAccessToken();
    const creds = refreshed.credentials;
    const accessToken = creds.access_token;
    if (!accessToken) {
      console.error(
        "[google-calendar] refreshAccessToken returned no access_token",
      );
      return null;
    }
    const newExpiry = creds.expiry_date
      ? new Date(creds.expiry_date)
      : new Date(now + 3600 * 1000);

    await prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        googleCalendarAccessToken: accessToken,
        googleCalendarAccessTokenExpiresAt: newExpiry,
      },
    });

    return accessToken;
  } catch (err) {
    console.error("[google-calendar] Failed to refresh access token:", err);
    return null;
  }
}

function appointmentStartEnd(params: {
  date: Date;
  time: string;
  timezone: string;
  durationMinutes: number;
}): { start: Date; end: Date } {
  const dateStr = params.date.toISOString().slice(0, 10);
  const timeWithSeconds =
    params.time.length === 5 ? `${params.time}:00` : params.time;
  const start = fromZonedTime(
    `${dateStr}T${timeWithSeconds}`,
    params.timezone,
  );
  const end = addMinutes(start, params.durationMinutes);
  return { start, end };
}

function extractMeetUrl(
  data: {
    hangoutLink?: string | null;
    conferenceData?: {
      entryPoints?: { entryPointType?: string | null; uri?: string | null }[];
    } | null;
  } | null | undefined,
): string | null {
  if (!data) return null;
  if (data.hangoutLink) return data.hangoutLink;
  const video = data.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video",
  );
  return video?.uri ?? null;
}

/**
 * Creates a Google Calendar event with Meet for a confirmed online appointment.
 * Idempotent if `googleCalendarEventId` is already set.
 * Silently skips (returning null) when the doctor has not connected Google Calendar.
 */
export async function createMeetEventForOnlineAppointment(
  appointmentId: string,
): Promise<{ googleMeetUrl: string | null }> {
  const existing = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      googleCalendarEventId: true,
      googleMeetUrl: true,
      consultationType: true,
      status: true,
    },
  });

  if (!existing) {
    console.error("[google-calendar] Appointment not found:", appointmentId);
    return { googleMeetUrl: null };
  }

  if (existing.googleCalendarEventId) {
    return { googleMeetUrl: existing.googleMeetUrl ?? null };
  }

  if (
    existing.consultationType !== ConsultationType.ONLINE ||
    existing.status !== AppointmentStatus.CONFIRMED
  ) {
    return { googleMeetUrl: null };
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      doctor: {
        include: {
          user: { select: { email: true } },
        },
      },
    },
  });

  if (!appointment) return { googleMeetUrl: null };

  const accessToken = await getValidDoctorAccessToken(appointment.doctorId);
  if (!accessToken) {
    return { googleMeetUrl: null };
  }

  const oauth2 = createOAuth2Client();
  if (!oauth2) return { googleMeetUrl: null };
  oauth2.setCredentials({ access_token: accessToken });

  const { start, end } = appointmentStartEnd({
    date: appointment.date,
    time: appointment.time,
    timezone: appointment.timezone,
    durationMinutes: appointment.durationMinutes ?? appointment.doctor.slotDurationMinutes,
  });

  const attendees: { email: string }[] = [
    { email: appointment.email },
  ];
  const doctorEmail = appointment.doctor.user?.email;
  if (doctorEmail) {
    attendees.push({ email: doctorEmail });
  }

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      requestBody: {
        summary: `Online: ${appointment.patientName} — ${formatDoctorDisplayName(appointment.doctor.name)}`,
        description: `BeelineCure online consultation (appointment ${appointment.id})`,
        start: {
          dateTime: start.toISOString(),
          timeZone: appointment.timezone,
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: appointment.timezone,
        },
        attendees,
        conferenceData: {
          createRequest: {
            requestId:
              appointment.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40) ||
              "beelinecure-meet",
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    const meetUrl = extractMeetUrl(res.data);
    const eventId = res.data.id;

    if (!eventId) {
      console.error("[google-calendar] events.insert returned no event id");
      return { googleMeetUrl: meetUrl };
    }

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        googleCalendarEventId: eventId,
        ...(meetUrl ? { googleMeetUrl: meetUrl } : {}),
      },
    });

    return { googleMeetUrl: meetUrl ?? null };
  } catch (err) {
    console.error("[google-calendar] events.insert failed:", err);
    return { googleMeetUrl: null };
  }
}

/**
 * Updates Calendar event times when an online appointment is rescheduled.
 */
export async function updateMeetEventForOnlineAppointment(
  appointmentId: string,
): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      doctor: {
        include: {
          user: { select: { email: true } },
        },
      },
    },
  });

  if (!appointment || appointment.consultationType !== ConsultationType.ONLINE) {
    return;
  }

  if (!appointment.googleCalendarEventId) {
    await createMeetEventForOnlineAppointment(appointmentId);
    return;
  }

  const accessToken = await getValidDoctorAccessToken(appointment.doctorId);
  if (!accessToken) return;

  const oauth2 = createOAuth2Client();
  if (!oauth2) return;
  oauth2.setCredentials({ access_token: accessToken });

  const { start, end } = appointmentStartEnd({
    date: appointment.date,
    time: appointment.time,
    timezone: appointment.timezone,
    durationMinutes: appointment.durationMinutes ?? appointment.doctor.slotDurationMinutes,
  });

  const attendees: { email: string }[] = [{ email: appointment.email }];
  const doctorEmail = appointment.doctor.user?.email;
  if (doctorEmail) attendees.push({ email: doctorEmail });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    const res = await calendar.events.patch({
      calendarId: "primary",
      eventId: appointment.googleCalendarEventId,
      conferenceDataVersion: 1,
      requestBody: {
        start: {
          dateTime: start.toISOString(),
          timeZone: appointment.timezone,
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: appointment.timezone,
        },
        attendees,
      },
    });

    const meetUrl = extractMeetUrl(res.data);
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        ...(meetUrl ? { googleMeetUrl: meetUrl } : {}),
      },
    });
  } catch (err) {
    console.error("[google-calendar] events.patch failed:", err);
  }
}

/**
 * Deletes the Google Calendar event when an online appointment is cancelled.
 * Uses the doctor's tokens — caller is responsible for passing the correct doctorId.
 */
const INTERVIEW_DURATION_MINUTES = 60;

/**
 * Creates a Google Calendar event with Meet for a confirmed careers interview round.
 */
export async function createMeetEventForInterviewRound(
  roundId: string,
): Promise<{ meetLink: string | null }> {
  const round = await prisma.interviewRound.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      roundNumber: true,
      scheduledAt: true,
      timezone: true,
      meetLink: true,
      googleCalendarEventId: true,
      attendeeEmail: true,
      scheduledByAdminId: true,
      application: {
        select: {
          name: true,
          email: true,
          jobPosting: { select: { title: true } },
        },
      },
    },
  });

  if (!round) {
    console.error("[google-calendar] Interview round not found:", roundId);
    return { meetLink: null };
  }

  if (round.googleCalendarEventId) {
    return { meetLink: round.meetLink ?? null };
  }

  const accessToken = await getValidAdminAccessToken(round.scheduledByAdminId);
  if (!accessToken) {
    return { meetLink: null };
  }

  const admin = await prisma.user.findUnique({
    where: { id: round.scheduledByAdminId },
    select: { email: true },
  });

  const oauth2 = createOAuth2Client();
  if (!oauth2) return { meetLink: null };
  oauth2.setCredentials({ access_token: accessToken });

  const start = round.scheduledAt;
  const end = addMinutes(start, INTERVIEW_DURATION_MINUTES);
  const timeZone = round.timezone?.trim() || "UTC";

  const attendees: { email: string }[] = [
    { email: round.application.email },
  ];
  if (round.attendeeEmail?.trim()) {
    attendees.push({ email: round.attendeeEmail.trim() });
  }
  if (admin?.email) {
    attendees.push({ email: admin.email });
  }

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      requestBody: {
        summary: `Interview: ${round.application.name} — ${round.application.jobPosting.title} (Round ${round.roundNumber})`,
        description: `BeelineCure careers interview (round ${round.id})`,
        start: {
          dateTime: start.toISOString(),
          timeZone,
        },
        end: {
          dateTime: end.toISOString(),
          timeZone,
        },
        attendees,
        conferenceData: {
          createRequest: {
            requestId:
              round.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40) ||
              "beelinecure-interview",
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    const meetLink = extractMeetUrl(res.data);
    const eventId = res.data.id;

    await prisma.interviewRound.update({
      where: { id: roundId },
      data: {
        ...(eventId ? { googleCalendarEventId: eventId } : {}),
        ...(meetLink ? { meetLink } : {}),
      },
    });

    return { meetLink: meetLink ?? null };
  } catch (err) {
    console.error("[google-calendar] interview events.insert failed:", err);
    return { meetLink: null };
  }
}

export async function deleteAdminInterviewCalendarEvent(
  adminUserId: string,
  eventId: string | null,
): Promise<void> {
  if (!eventId) return;

  const accessToken = await getValidAdminAccessToken(adminUserId);
  if (!accessToken) return;

  const oauth2 = createOAuth2Client();
  if (!oauth2) return;
  oauth2.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });
  } catch (err) {
    console.error("[google-calendar] admin interview events.delete failed:", err);
  }
}

export async function updateMeetEventForInterviewRound(
  roundId: string,
): Promise<void> {
  const round = await prisma.interviewRound.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      roundNumber: true,
      scheduledAt: true,
      timezone: true,
      googleCalendarEventId: true,
      scheduledByAdminId: true,
      application: {
        select: {
          name: true,
          jobPosting: { select: { title: true } },
        },
      },
    },
  });

  if (!round?.googleCalendarEventId) return;

  const accessToken = await getValidAdminAccessToken(round.scheduledByAdminId);
  if (!accessToken) return;

  const oauth2 = createOAuth2Client();
  if (!oauth2) return;
  oauth2.setCredentials({ access_token: accessToken });

  const start = round.scheduledAt;
  const end = addMinutes(start, INTERVIEW_DURATION_MINUTES);
  const timeZone = round.timezone?.trim() || "UTC";

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    await calendar.events.patch({
      calendarId: "primary",
      eventId: round.googleCalendarEventId,
      requestBody: {
        summary: `Interview: ${round.application.name} — ${round.application.jobPosting.title} (Round ${round.roundNumber})`,
        start: {
          dateTime: start.toISOString(),
          timeZone,
        },
        end: {
          dateTime: end.toISOString(),
          timeZone,
        },
      },
    });
  } catch (err) {
    console.error("[google-calendar] interview events.patch failed:", err);
  }
}

export async function deleteMeetCalendarEvent(
  doctorId: string,
  eventId: string | null,
): Promise<void> {
  if (!eventId) return;

  const accessToken = await getValidDoctorAccessToken(doctorId);
  if (!accessToken) return;

  const oauth2 = createOAuth2Client();
  if (!oauth2) return;
  oauth2.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });
  } catch (err) {
    console.error("[google-calendar] events.delete failed:", err);
  }
}
