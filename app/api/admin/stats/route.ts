import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import {
  AppointmentStatus,
  DoctorApprovalStatus,
  PaymentMethod,
  UserRole,
} from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import {
  coerceSupportedCurrency,
  isSupportedCurrency,
  type SupportedCurrency,
} from "@/lib/currency";
import { convertCentsAmount } from "@/lib/fx-rates";

type CurrencySource = "preference" | "query";

function resolveTargetCurrency(
  preferredCurrency: string | null | undefined,
  queryCurrency: string | null,
): { targetCurrency: SupportedCurrency; source: CurrencySource } {
  if (preferredCurrency && preferredCurrency.trim().length > 0) {
    return {
      targetCurrency: coerceSupportedCurrency(preferredCurrency),
      source: "preference",
    };
  }
  const queryUpper = queryCurrency?.trim().toUpperCase() ?? "";
  if (queryUpper && isSupportedCurrency(queryUpper)) {
    return { targetCurrency: queryUpper, source: "query" };
  }
  return { targetCurrency: "USD", source: "query" };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const queryCurrency = request.nextUrl.searchParams.get("currency");
  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { preferredCurrency: true },
  });
  const { targetCurrency, source } = resolveTargetCurrency(
    adminUser?.preferredCurrency,
    queryCurrency,
  );

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const revenueBaseSelect = {
    priceCentsAtBooking: true,
    currencyAtBooking: true,
    paymentMethod: true,
    stripePaymentId: true,
  } as const;

  const [
    totalApprovedDoctors,
    totalPatients,
    totalBookingsAllTime,
    totalBookingsThisMonth,
    totalCancelledBookings,
    onlineRevenueCandidates,
    offlineRevenueCandidates,
    recentBookingsRaw,
  ] = await Promise.all([
    prisma.doctor.count({
      where: {
        approvalStatus: DoctorApprovalStatus.APPROVED,
        isActive: true,
      },
    }),
    prisma.user.count({
      where: { role: UserRole.PATIENT },
    }),
    prisma.appointment.count(),
    prisma.appointment.count({
      where: { createdAt: { gte: monthStart } },
    }),
    prisma.appointment.count({
      where: { status: AppointmentStatus.CANCELLED },
    }),
    prisma.appointment.findMany({
      where: {
        AND: [
          {
            status: AppointmentStatus.COMPLETED,
            priceCentsAtBooking: { not: null },
            currencyAtBooking: { not: null },
          },
          {
            OR: [
              { paymentMethod: PaymentMethod.ONLINE },
              { paymentMethod: null, stripePaymentId: { not: null } },
            ],
          },
        ],
      },
      select: revenueBaseSelect,
    }),
    prisma.appointment.findMany({
      where: {
        AND: [
          {
            status: AppointmentStatus.COMPLETED,
            priceCentsAtBooking: { not: null },
            currencyAtBooking: { not: null },
          },
          {
            OR: [
              { paymentMethod: PaymentMethod.PAY_AT_CLINIC },
              { paymentMethod: null, stripePaymentId: null },
            ],
          },
        ],
      },
      select: revenueBaseSelect,
    }),
    prisma.appointment.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        patientName: true,
        consultationType: true,
        status: true,
        date: true,
        time: true,
        createdAt: true,
        priceCentsAtBooking: true,
        currencyAtBooking: true,
        doctor: {
          select: { name: true },
        },
      },
    }),
  ]);

  async function sumRevenueCents(
    rows: { priceCentsAtBooking: number | null; currencyAtBooking: string | null }[],
  ): Promise<number> {
    let total = 0;
    for (const row of rows) {
      const amountCents = row.priceCentsAtBooking;
      const fromCurrency = row.currencyAtBooking;
      if (typeof amountCents !== "number" || !fromCurrency) continue;
      try {
        total += await convertCentsAmount(amountCents, fromCurrency, targetCurrency);
      } catch {
        // Skip rows we cannot convert.
      }
    }
    return total;
  }

  const [onlineRevenueCents, offlineRevenueCents] = await Promise.all([
    sumRevenueCents(onlineRevenueCandidates),
    sumRevenueCents(offlineRevenueCandidates),
  ]);
  const totalRevenueCents = onlineRevenueCents + offlineRevenueCents;

  const recentBookings = await Promise.all(
    recentBookingsRaw.map(async (row) => {
      const amountCents = row.priceCentsAtBooking;
      const fromCurrency = row.currencyAtBooking;
      let convertedAmountCents: number | null = null;
      if (typeof amountCents === "number" && fromCurrency) {
        try {
          convertedAmountCents = await convertCentsAmount(
            amountCents,
            fromCurrency,
            targetCurrency,
          );
        } catch {
          convertedAmountCents = null;
        }
      }
      return {
        id: row.id,
        patientName: row.patientName,
        doctorName: formatDoctorDisplayName(row.doctor.name),
        appointmentType: row.consultationType,
        amountCents: convertedAmountCents,
        status: row.status,
        date: row.date.toISOString(),
        time: row.time,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  );

  return NextResponse.json({
    totals: {
      approvedDoctors: totalApprovedDoctors,
      patients: totalPatients,
      bookingsAllTime: totalBookingsAllTime,
      bookingsThisMonth: totalBookingsThisMonth,
    },
    revenue: {
      amountCents: totalRevenueCents,
      onlineAmountCents: onlineRevenueCents,
      offlineAmountCents: offlineRevenueCents,
      currency: targetCurrency,
      source,
    },
    cancellationRate:
      totalBookingsAllTime === 0
        ? 0
        : (totalCancelledBookings / totalBookingsAllTime) * 100,
    recentBookings,
  });
}
