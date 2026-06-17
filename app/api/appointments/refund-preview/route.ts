import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import {
  coerceSupportedCurrency,
  isSupportedCurrency,
  type SupportedCurrency,
} from "@/lib/currency";
import { prisma } from "@/lib/db";
import { convertCentsAmount } from "@/lib/fx-rates";
import {
  getStaffRefundPreviewForAppointment,
  type StaffCancelReason,
} from "@/lib/refund-preview";

export async function GET(request: NextRequest) {
  const requestedCurrency = request.nextUrl.searchParams
    .get("targetCurrency")
    ?.trim()
    .toUpperCase();
  const targetCurrency: SupportedCurrency | null =
    requestedCurrency && isSupportedCurrency(requestedCurrency)
      ? coerceSupportedCurrency(requestedCurrency)
      : null;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appointmentId =
    request.nextUrl.searchParams.get("appointmentId")?.trim() ?? "";
  if (!appointmentId) {
    return NextResponse.json(
      { error: "appointmentId is required" },
      { status: 400 },
    );
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      doctorId: true,
      consultationType: true,
      paymentStatus: true,
      stripePaymentId: true,
      stripePaymentIntentId: true,
      refundStatus: true,
      date: true,
      time: true,
      timezone: true,
      currencyAtBooking: true,
    },
  });

  if (!appointment) {
    return NextResponse.json(
      { error: "Appointment not found" },
      { status: 404 },
    );
  }

  // Authorization: admins always allowed; doctors only for their own
  // appointments. Patients use the existing /api/cancel-appointment GET route.
  if (session.user.role === UserRole.DOCTOR) {
    const doctor = await prisma.doctor.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!doctor || doctor.id !== appointment.doctorId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reasonParam = request.nextUrl.searchParams.get("reason")?.trim();
  const staffReason: StaffCancelReason =
    reasonParam === "patient_no_show" || reasonParam === "doctor_unavailable"
      ? reasonParam
      : null;

  const refundPreview = await getStaffRefundPreviewForAppointment(
    appointment,
    staffReason,
  );
  if (
    refundPreview &&
    targetCurrency &&
    refundPreview.currency &&
    typeof refundPreview.eligibleRefundAmountCents === "number"
  ) {
    try {
      const converted = await convertCentsAmount(
        refundPreview.eligibleRefundAmountCents,
        refundPreview.currency,
        targetCurrency,
      );
      return NextResponse.json({
        refundPreview: {
          ...refundPreview,
          equivalentAmountCents: converted,
          equivalentCurrency: targetCurrency,
        },
      });
    } catch {
      return NextResponse.json({ refundPreview });
    }
  }

  return NextResponse.json({ refundPreview });
}
