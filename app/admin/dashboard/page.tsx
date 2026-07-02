"use client";

import { useEffect, useMemo, useState } from "react";
import { Container } from "@/components/layout/Container";
import { Skeleton } from "@/components/ui/skeleton";
import {
  currencyForTimezone,
  formatPrice,
  type SupportedCurrency,
} from "@/lib/currency";

type StatsResponse = {
  totals: {
    approvedDoctors: number;
    patients: number;
    bookingsAllTime: number;
    bookingsThisMonth: number;
  };
  revenue: {
    amountCents: number;
    onlineAmountCents: number;
    offlineAmountCents: number;
    currency: SupportedCurrency;
    source: "preference" | "query";
  };
  cancellationRate: number;
  recentBookings: Array<{
    id: string;
    patientName: string;
    doctorName: string;
    appointmentType: "CLINIC" | "ONLINE";
    amountCents: number | null;
    status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
    date: string;
    time: string;
  }>;
};

function browserCurrency(): SupportedCurrency {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return currencyForTimezone(timezone);
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function AdminDashboardSkeleton() {
  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4"
          >
            <Skeleton className="h-3 w-32 bg-[#e5e5e5]" />
            <Skeleton className="mt-3 h-8 w-20 bg-[#e5e5e5]" />
            {i === 4 ? (
              <div className="mt-2 space-y-1.5">
                <Skeleton className="h-3 w-28 bg-[#e5e5e5]" />
                <Skeleton className="h-3 w-36 bg-[#e5e5e5]" />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-[#e5e5e5]">
        <table className="min-w-[960px] w-full border-collapse bg-white">
          <thead className="bg-[#fafafa]">
            <tr>
              {Array.from({ length: 6 }).map((_, i) => (
                <th key={i} className="px-3 py-3 text-left">
                  <Skeleton className="h-3 w-16 bg-[#e5e5e5]" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-t border-[#ededed]">
                {Array.from({ length: 6 }).map((_, colIndex) => (
                  <td key={colIndex} className="px-3 py-3">
                    <Skeleton
                      className={`h-4 bg-[#e5e5e5] ${
                        colIndex === 0
                          ? "w-28"
                          : colIndex === 1
                            ? "w-24"
                            : "w-16"
                      }`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const detectedCurrency = useMemo(() => browserCurrency(), []);

  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ currency: detectedCurrency });
        const res = await fetch(`/api/admin/stats?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setError("Failed to load dashboard stats.");
          return;
        }
        const json = (await res.json()) as StatsResponse;
        if (!cancelled) setStats(json);
      } catch {
        if (!cancelled) setError("Failed to load dashboard stats.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadStats();
    return () => {
      cancelled = true;
    };
  }, [detectedCurrency]);

  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
          <h1 className="font-montaga text-2xl font-semibold text-[#333333] md:text-3xl">
            Admin Dashboard
          </h1>
          <p className="mt-2 font-montserrat text-sm text-[#5e5e5e]">
            Key platform metrics and recent bookings.
          </p>

          {loading ? (
            <AdminDashboardSkeleton />
          ) : error ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#ffd0d0] bg-[#fff6f6] p-4">
              <p className="font-montserrat text-sm text-[#b42318]">{error}</p>
            </div>
          ) : stats ? (
            <>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
                  <p className="font-montserrat text-xs uppercase tracking-wide text-[#5e5e5e]">
                    Total approved doctors
                  </p>
                  <p className="mt-2 font-montserrat text-2xl font-semibold text-[#111111]">
                    {stats.totals.approvedDoctors}
                  </p>
                </div>
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
                  <p className="font-montserrat text-xs uppercase tracking-wide text-[#5e5e5e]">
                    Registered patients
                  </p>
                  <p className="mt-2 font-montserrat text-2xl font-semibold text-[#111111]">
                    {stats.totals.patients}
                  </p>
                </div>
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
                  <p className="font-montserrat text-xs uppercase tracking-wide text-[#5e5e5e]">
                    Bookings all-time
                  </p>
                  <p className="mt-2 font-montserrat text-2xl font-semibold text-[#111111]">
                    {stats.totals.bookingsAllTime}
                  </p>
                </div>
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
                  <p className="font-montserrat text-xs uppercase tracking-wide text-[#5e5e5e]">
                    Bookings this month
                  </p>
                  <p className="mt-2 font-montserrat text-2xl font-semibold text-[#111111]">
                    {stats.totals.bookingsThisMonth}
                  </p>
                </div>
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
                  <p className="font-montserrat text-xs uppercase tracking-wide text-[#5e5e5e]">
                    Total revenue
                  </p>
                  <p className="mt-2 font-montserrat text-2xl font-semibold text-[#111111]">
                    {formatPrice(
                      stats.revenue.amountCents,
                      stats.revenue.currency,
                    )}{" "}
                    <span className="text-base font-medium text-[#5e5e5e]">
                      {stats.revenue.currency}
                    </span>
                  </p>
                  <div className="mt-2 space-y-0.5">
                    <p className="font-montserrat text-xs text-[#5e5e5e]">
                      Online:{" "}
                      <span className="font-medium text-[#333333]">
                        {formatPrice(
                          stats.revenue.onlineAmountCents,
                          stats.revenue.currency,
                        )}
                      </span>
                    </p>
                    <p className="font-montserrat text-xs text-[#5e5e5e]">
                      Offline (pay at clinic):{" "}
                      <span className="font-medium text-[#333333]">
                        {formatPrice(
                          stats.revenue.offlineAmountCents,
                          stats.revenue.currency,
                        )}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
                  <p className="font-montserrat text-xs uppercase tracking-wide text-[#5e5e5e]">
                    Cancellation rate
                  </p>
                  <p className="mt-2 font-montserrat text-2xl font-semibold text-[#111111]">
                    {formatPercent(stats.cancellationRate)}
                  </p>
                </div>
              </div>

              {stats.revenue.source === "query" ? (
                <p className="mt-4 font-montserrat text-xs text-[#5e5e5e]">
                  Currency was auto-detected from your browser locale.
                </p>
              ) : null}

              <div className="mt-8 overflow-x-auto rounded-xl border border-[#e5e5e5]">
                <table className="min-w-[960px] w-full border-collapse bg-white">
                  <thead className="bg-[#fafafa]">
                    <tr>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Patient
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Doctor
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Type
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Amount
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Status
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentBookings.map((booking) => (
                      <tr
                        key={booking.id}
                        className="border-t border-[#ededed]"
                      >
                        <td className="px-3 py-3 font-montserrat text-sm text-[#333333]">
                          {booking.patientName}
                        </td>
                        <td className="px-3 py-3 font-montserrat text-sm text-[#333333]">
                          {booking.doctorName}
                        </td>
                        <td className="px-3 py-3 font-montserrat text-sm text-[#333333]">
                          {booking.appointmentType === "CLINIC"
                            ? "Clinic"
                            : "Online"}
                        </td>
                        <td className="px-3 py-3 font-montserrat text-sm text-[#333333]">
                          {typeof booking.amountCents === "number"
                            ? formatPrice(
                                booking.amountCents,
                                stats.revenue.currency,
                              )
                            : "—"}
                        </td>
                        <td className="px-3 py-3 font-montserrat text-sm text-[#333333]">
                          {booking.status}
                        </td>
                        <td className="px-3 py-3 font-montserrat text-sm text-[#5e5e5e]">
                          {formatDate(booking.date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </Container>
    </div>
  );
}
