import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { publicDoctorByIdWhere } from "@/lib/doctor-visibility";
import {
  BookingSessionStatus,
  UserRole,
} from "@/generated/prisma/client";
import {
  parsePriceMap,
  priceCentsForDuration,
} from "@/lib/doctor-pricing";
import { coerceSupportedCurrency } from "@/lib/currency";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import {
  isDoctorSlotInPast,
  PAST_OR_UNAVAILABLE_SLOT_MESSAGE,
} from "@/lib/timezone-display";
import {
  DOCTOR_CALENDAR_NOT_CONNECTED_CODE,
  DOCTOR_CALENDAR_NOT_CONNECTED_MESSAGE,
  isDoctorGoogleCalendarConnected,
} from "@/lib/doctor-online-booking";
import {
  assertSlotBookable,
  SLOT_NO_LONGER_AVAILABLE_MESSAGE,
} from "@/lib/slot-availability";

const schema = z.object({
  bookingSessionId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role === UserRole.DOCTOR) {
      return NextResponse.json(
        { error: "Doctors cannot book consultations." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { bookingSessionId } = parsed.data;

    const bookingSession = await prisma.bookingSession.findUnique({
      where: { id: bookingSessionId },
    });

    if (!bookingSession) {
      return NextResponse.json(
        { error: "Booking session not found" },
        { status: 404 },
      );
    }

    const isExpired =
      bookingSession.status === BookingSessionStatus.EXPIRED ||
      bookingSession.expiresAt < new Date();

    if (isExpired) {
      return NextResponse.json(
        {
          error:
            "This booking session expired after 10 minutes. Please start a new booking.",
          code: "BOOKING_SESSION_EXPIRED",
          doctorId: bookingSession.doctorId,
        },
        { status: 400 },
      );
    }

    if (bookingSession.status !== BookingSessionStatus.PENDING) {
      return NextResponse.json(
        { error: "Booking session is no longer valid" },
        { status: 400 },
      );
    }
    if (
      bookingSession.consultationType !== "ONLINE" &&
      bookingSession.consultationType !== "CLINIC"
    ) {
      return NextResponse.json(
        { error: "This booking session cannot proceed to payment" },
        { status: 409 },
      );
    }

    const doctor = await prisma.doctor.findFirst({
      where: publicDoctorByIdWhere(bookingSession.doctorId),
      select: {
        name: true,
        currency: true,
        consultationPriceCentsByDuration: true,
        googleCalendarRefreshToken: true,
      },
    });

    if (!doctor) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }

    if (
      bookingSession.consultationType === "ONLINE" &&
      !isDoctorGoogleCalendarConnected(doctor)
    ) {
      return NextResponse.json(
        {
          error: DOCTOR_CALENDAR_NOT_CONNECTED_MESSAGE,
          code: DOCTOR_CALENDAR_NOT_CONNECTED_CODE,
          doctorId: bookingSession.doctorId,
        },
        { status: 409 },
      );
    }

    // Hard server-side guard: reject slots that have already started in the
    // doctor's timezone, even if the patient is on a stale review page.
    const doctorDateYmd = bookingSession.date;
    if (
      isDoctorSlotInPast(
        doctorDateYmd,
        bookingSession.time,
        bookingSession.timezone,
      )
    ) {
      // Keep booking session state as-is; the patient can safely rebook.
      return NextResponse.json(
        {
          error: PAST_OR_UNAVAILABLE_SLOT_MESSAGE,
          code: "SLOT_NO_LONGER_AVAILABLE",
        },
        { status: 409 },
      );
    }

    const slotBookable = await assertSlotBookable({
      doctorId: bookingSession.doctorId,
      dateYmd: doctorDateYmd,
      time: bookingSession.time,
      excludeBookingSessionId: bookingSessionId,
    });
    if (!slotBookable.ok) {
      return NextResponse.json(
        {
          error: SLOT_NO_LONGER_AVAILABLE_MESSAGE,
          code: "SLOT_NO_LONGER_AVAILABLE",
        },
        { status: 409 },
      );
    }

    const headersList = await headers();
    const origin = headersList.get("origin");

    // Use the price + currency snapshotted at booking-session creation. Fall
    // back to the doctor's current map only for legacy sessions where the
    // snapshot is missing.
    const priceMap = parsePriceMap(doctor.consultationPriceCentsByDuration);
    const unitAmountCents =
      bookingSession.priceCentsAtBooking ??
      priceCentsForDuration(priceMap, bookingSession.durationMinutes);
    const currency = coerceSupportedCurrency(
      bookingSession.currencyAtBooking ?? doctor.currency,
    );
    const doctorName = doctor.name?.trim()
      ? formatDoctorDisplayName(doctor.name)
      : "your doctor";
    const isClinic = bookingSession.consultationType === "CLINIC";
    const description = isClinic
      ? `Clinic visit (${bookingSession.durationMinutes} min) with ${doctorName}.`
      : `A secure ${bookingSession.durationMinutes} min online consultation with ${doctorName}.`;
    const productName = isClinic
      ? `Clinic visit with ${doctorName}`
      : `Online consultation with ${doctorName}`;

    const stripeSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: unitAmountCents,
            product_data: {
              name: productName,
              description,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/book-appointment/review/${encodeURIComponent(bookingSession.id)}`,
      metadata: {
        bookingSessionId: bookingSession.id,
        doctorId: bookingSession.doctorId,
        date: bookingSession.date,
        time: bookingSession.time,
        durationMinutes: String(bookingSession.durationMinutes),
        consultationPriceCents: String(unitAmountCents),
        consultationCurrency: currency,
        consultationType: bookingSession.consultationType,
        patientName: bookingSession.patientName,
        email: bookingSession.email,
        phone: bookingSession.phone,
      },
    });

    return NextResponse.json({ url: stripeSession.url });
  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "An unknown error occurred" },
      { status: 500 },
    );
  }
}
