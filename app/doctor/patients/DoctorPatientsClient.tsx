"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { MontagaCapitalN } from "@/components/ui/MontagaCapitalN";
import {
  formatDateInDoctorTz,
  formatTimeInDoctorTz,
  isDoctorTimeInPast,
} from "@/lib/timezone-display";

type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

type DoctorPatientListItem = {
  patientName: string;
  email: string;
  phone: string;
  appointmentCount: number;
  prescriptionCount: number;
  hasPrescription: boolean;
  lastAppointmentDate: string;
  lastAppointmentTime: string;
  lastAppointmentTimezone: string;
  lastAppointmentStatus: AppointmentStatus;
};

function appointmentStatusBadgeClass(status: AppointmentStatus): string {
  if (status === "PENDING")
    return "border-amber-500/30 bg-amber-500/10 text-amber-800";
  if (status === "CONFIRMED")
    return "border-[#2555F3]/30 bg-[#2555F3]/10 text-[#2555F3]";
  if (status === "COMPLETED")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-800";
  return "border-red-500/30 bg-red-500/10 text-red-800";
}

function appointmentHistoryLabel(item: DoctorPatientListItem): string {
  const isFuture = !isDoctorTimeInPast(
    item.lastAppointmentDate,
    item.lastAppointmentTime,
    item.lastAppointmentTimezone,
  );
  if (!isFuture) return "Last appointment";
  if (item.lastAppointmentStatus === "CANCELLED") return "Upcoming (Cancelled)";
  return "Upcoming appointment";
}

export default function DoctorPatientsClient() {
  const [items, setItems] = useState<DoctorPatientListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);

  const loadPatients = useCallback(
    async (nextPage: number, append: boolean) => {
      const requestId = ++latestRequestIdRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "5",
        });
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(`/api/doctor/patients?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (latestRequestIdRef.current !== requestId) return;
          setError("Failed to load patients.");
          return;
        }

        const data = (await res.json()) as {
          items?: DoctorPatientListItem[];
          hasMore?: boolean;
          page?: number;
        };
        if (latestRequestIdRef.current !== requestId) return;

        const nextItems = Array.isArray(data.items) ? data.items : [];
        setItems((current) =>
          append ? [...current, ...nextItems] : nextItems,
        );
        setHasMore(Boolean(data.hasMore));
        setPage(typeof data.page === "number" ? data.page : nextPage);
      } catch {
        if (latestRequestIdRef.current !== requestId) return;
        setError("Failed to load patients.");
      } finally {
        if (latestRequestIdRef.current !== requestId) return;
        setIsLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    void loadPatients(1, false);
  }, [loadPatients]);

  const [sentryRef] = useInfiniteScroll({
    loading: isLoading,
    hasNextPage: hasMore,
    onLoadMore: () => void loadPatients(page + 1, true),
    disabled: false,
    rootMargin: "0px 0px 300px 0px",
  });

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
          Patients
        </h1>
        <p className="font-montserrat text-sm text-[#5E5E5E]">
          Review your patient history and open detailed health summaries.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-8 sm:gap-y-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
          <label
            htmlFor="doctor-patients-search"
            className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
          >
            Patient
          </label>
          <div className="relative w-full">
            <input
              id="doctor-patients-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, or phone"
              className="w-full min-w-0 rounded-xl border border-[#e5e5e5] bg-white py-2 pl-3 pr-14 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer font-montserrat text-sm text-[#5E5E5E] hover:text-[#333333]"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
          <p className="font-montserrat text-sm font-medium text-[#333333]">
            {error}
          </p>
        </div>
      ) : !isLoading && items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
          <p className="font-montserrat text-sm font-medium text-[#333333]">
            No patients found for this search.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid w-full grid-cols-1 gap-4">
          {items.map((item) => (
            <Link
              key={item.email.toLowerCase()}
              href={`/doctor/patients/${encodeURIComponent(item.email)}`}
              className="block rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm transition-colors hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2555F3]/40"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-montaga text-lg font-semibold text-[#333333]">
                    <MontagaCapitalN text={item.patientName} />
                  </p>
                  <p className="mt-1 break-all font-montserrat text-sm text-[#5E5E5E]">
                    {item.email}
                  </p>
                  <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
                    {item.phone}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[#2555F3]/30 bg-[#2555F3]/10 px-2.5 py-1 font-montserrat text-xs font-medium text-[#2555F3]">
                  {item.appointmentCount} appointment
                  {item.appointmentCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-3 rounded-lg border border-[#efefef] bg-[#fafafa] px-3 py-2">
                <p className="font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5E5E5E]">
                  History
                </p>
                <p className="mt-1 font-montserrat text-sm text-[#333333]">
                  {appointmentHistoryLabel(item)}:{" "}
                  {formatDateInDoctorTz(
                    item.lastAppointmentDate,
                    item.lastAppointmentTime,
                    item.lastAppointmentTimezone,
                  )}{" "}
                  at{" "}
                  {formatTimeInDoctorTz(
                    item.lastAppointmentDate,
                    item.lastAppointmentTime,
                    item.lastAppointmentTimezone,
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 font-montserrat text-xs font-medium ${appointmentStatusBadgeClass(
                      item.lastAppointmentStatus,
                    )}`}
                  >
                    {item.lastAppointmentStatus}
                  </span>
                  <span className="font-montserrat text-sm text-[#5E5E5E]">
                    {item.prescriptionCount} prescription
                    {item.prescriptionCount === 1 ? "" : "s"} issued
                  </span>
                </div>
              </div>
            </Link>
          ))}

          {(hasMore || isLoading) && (
            <div
              ref={sentryRef}
              className="py-2 text-center font-montserrat text-sm text-[#5E5E5E]"
            >
              {isLoading ? "Loading..." : "Scroll for more"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
