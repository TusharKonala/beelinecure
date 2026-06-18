"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { Button } from "@/components/ui/button";
import { MontagaCapitalN } from "@/components/ui/MontagaCapitalN";
import { formatDateInDoctorTz, formatTimeInDoctorTz } from "@/lib/timezone-display";

type ConsultationType = "CLINIC" | "ONLINE";

type PrescriptionMedicine = {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions: string;
};

type DoctorPrescriptionItem = {
  appointmentId: string;
  patientName: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  timezone: string;
  consultationType: ConsultationType;
  medicines: PrescriptionMedicine[];
};

function consultationLabel(type: ConsultationType) {
  return type === "ONLINE" ? "Online" : "Clinic";
}

type DateFilterValue = "asc" | "desc" | "today" | "week" | "month";
const DEFAULT_DATE_FILTER: DateFilterValue = "desc";

/** Hide native select arrow; custom chevron at `right: 0.75rem` with `pr-10` text inset. */
const SELECT_CHEVRON =
  'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23333333%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:1rem_1rem] bg-[position:right_0.75rem_center] bg-no-repeat';

function searchFromParam(raw: string | null): string {
  return (raw ?? "").trim();
}

export default function DoctorPrescriptionsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchFromParam(searchParams.get("search"));
  const [items, setItems] = useState<DoctorPrescriptionItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);

  const loadPrescriptions = useCallback(async (nextPage: number, append: boolean) => {
    const requestId = ++latestRequestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        dateFilter,
        page: String(nextPage),
        limit: "5",
      });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/doctor/prescriptions?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (latestRequestIdRef.current !== requestId) return;
        setError("Failed to load prescriptions.");
        return;
      }
      const data = (await res.json()) as {
        items?: DoctorPrescriptionItem[];
        hasMore?: boolean;
        page?: number;
      };
      if (latestRequestIdRef.current !== requestId) return;
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setItems((current) => (append ? [...current, ...nextItems] : nextItems));
      setHasMore(Boolean(data.hasMore));
      setPage(typeof data.page === "number" ? data.page : nextPage);
    } catch {
      if (latestRequestIdRef.current !== requestId) return;
      setError("Failed to load prescriptions.");
    } finally {
      if (latestRequestIdRef.current !== requestId) return;
      setIsLoading(false);
    }
  }, [dateFilter, search]);

  useEffect(() => {
    void loadPrescriptions(1, false);
  }, [loadPrescriptions]);

  useEffect(() => {
    setSearch(searchFromParam(searchParams.get("search")));
  }, [searchParams]);

  const hasActiveFilters =
    search.trim() !== "" || dateFilter !== DEFAULT_DATE_FILTER;

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setDateFilter(DEFAULT_DATE_FILTER);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("search");
    const qs = nextParams.toString();
    router.replace(qs ? `/doctor/prescriptions?${qs}` : "/doctor/prescriptions", {
      scroll: false,
    });
  }, [router, searchParams]);

  const [sentryRef] = useInfiniteScroll({
    loading: isLoading,
    hasNextPage: hasMore,
    onLoadMore: () => void loadPrescriptions(page + 1, true),
    disabled: false,
    rootMargin: "0px 0px 300px 0px",
  });

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
          Prescriptions
        </h1>
        <p className="font-montserrat text-sm text-[#5E5E5E]">
          View all prescriptions from your completed appointments.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-montserrat text-xs text-[#5E5E5E]">
          Filter by patient and date.
        </p>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="cursor-pointer font-montserrat text-xs text-[#777777] underline underline-offset-4 transition hover:text-[#2555F3]"
          >
            Clear all filters
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-8 sm:gap-y-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
          <label
            htmlFor="doctor-prescriptions-search"
            className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
          >
            Patient
          </label>
          <input
            id="doctor-prescriptions-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or phone"
            className="w-full min-w-0 rounded-xl border border-[#e5e5e5] bg-white py-2 px-3 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
          <label
            htmlFor="doctor-prescriptions-date-filter"
            className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
          >
            Date
          </label>
          <select
            id="doctor-prescriptions-date-filter"
            value={dateFilter}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "asc" || v === "desc" || v === "today" || v === "week" || v === "month") {
                setDateFilter(v);
              }
            }}
            className={`w-full min-w-0 cursor-pointer rounded-xl border border-[#e5e5e5] bg-white py-2 pl-3 pr-10 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
          >
            <option value="desc">Latest first</option>
            <option value="asc">Earliest first</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
          <p className="font-montserrat text-sm font-medium text-[#333333]">{error}</p>
        </div>
      ) : !isLoading && items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
          <p className="font-montserrat text-sm font-medium text-[#333333]">
            No prescriptions found for completed appointments.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid w-full grid-cols-1 gap-4">
          {items.map((item) => {
            const consultation = consultationLabel(item.consultationType);
            return (
              <article
                key={item.appointmentId}
                className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-montaga text-lg font-semibold text-[#333333]">
                      <MontagaCapitalN text={item.patientName} />
                    </p>
                    <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">{item.email}</p>
                    <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">{item.phone}</p>
                    <div className="mt-2 flex flex-col gap-1 font-montserrat text-sm text-[#333333] min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-center">
                      <span>
                        <span className="font-medium">Date:</span>{" "}
                        {formatDateInDoctorTz(item.date, item.time, item.timezone)}
                      </span>
                      <span
                        className="hidden text-[#e5e5e5] min-[400px]:mx-2 min-[400px]:inline"
                        aria-hidden
                      >
                        |
                      </span>
                      <span>
                        <span className="font-medium">Time:</span>{" "}
                        {formatTimeInDoctorTz(item.date, item.time, item.timezone)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 font-montserrat text-xs font-medium ${
                        consultation === "Online"
                          ? "border-[#2555F3]/30 bg-[#2555F3]/10 text-[#2555F3]"
                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
                      }`}
                    >
                      {consultation}
                    </span>
                    <span className="rounded-full border border-[#2555F3]/30 bg-[#2555F3]/10 px-2.5 py-1 font-montserrat text-xs font-medium text-[#2555F3]">
                      {item.medicines.length} medicine{item.medicines.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5E5E5E]">
                    Medicines
                  </p>
                  <ul className="mt-2 space-y-1">
                    {item.medicines.map((medicine, idx) => (
                      <li key={`${item.appointmentId}-${medicine.name}-${idx}`}>
                        <p className="font-montserrat text-sm text-[#333333]">
                          <span className="font-medium">{medicine.name}</span> - {medicine.dosage} tabs ·{" "}
                          {medicine.frequency}x daily · {medicine.durationDays} day
                          {medicine.durationDays === 1 ? "" : "s"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-fit cursor-pointer rounded-xl border-2 border-[#b8b8b8] font-montserrat hover:border-[#8a8a8a]"
                  >
                    <Link
                      href={`/doctor/prescriptions/${item.appointmentId}/view?from=prescriptions`}
                    >
                      View prescription
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
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
