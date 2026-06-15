"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useInfiniteScroll from "react-infinite-scroll-hook";

import { Container } from "@/components/layout/Container";
import { DoctorProfilePhoto } from "@/components/doctor/DoctorProfilePhoto";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ALLOWED_SLOT_DURATION_MINUTES,
  type AllowedSlotDurationMinutes,
} from "@/lib/doctor-availability-slots";
import { currencyForTimezone, type SupportedCurrency } from "@/lib/currency";
import { DOCTOR_SPECIALIZATIONS } from "@/lib/doctor-specializations";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { specializationForSymptom, searchSymptoms } from "@/lib/symptomMap";

type DoctorCard = {
  id: string;
  name: string;
  specialization: string;
  qualification: string;
  profilePhotoUrl: string;
  slug: string | null;
};

type ListResponse = {
  items: DoctorCard[];
  page: number;
  limit: number;
  hasMore: boolean;
};

const CHEVRON_CLASSES =
  'cursor-pointer appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000/svg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23333333%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:1rem_1rem] bg-[position:right_0.75rem_center] bg-no-repeat';

function doctorListUrl(params: {
  nameSearch: string;
  specialty: string;
  consultationMode: string;
  feeMinCents: number | null;
  feeMaxCents: number | null;
  feeDurationMinutes: AllowedSlotDurationMinutes;
  patientCurrency: SupportedCurrency;
  page: number;
}): string {
  const sp = new URLSearchParams();
  sp.set("page", String(params.page));
  sp.set("limit", "6");
  if (params.nameSearch.trim()) sp.set("nameSearch", params.nameSearch.trim());
  if (params.specialty) sp.set("specialty", params.specialty);
  if (
    params.consultationMode === "online" ||
    params.consultationMode === "clinic"
  ) {
    sp.set("consultationMode", params.consultationMode);
  }
  sp.set("patientCurrency", params.patientCurrency);
  sp.set("feeDurationMinutes", String(params.feeDurationMinutes));
  if (params.feeMinCents != null)
    sp.set("feeMinCents", String(params.feeMinCents));
  if (params.feeMaxCents != null)
    sp.set("feeMaxCents", String(params.feeMaxCents));
  return `/api/doctors?${sp.toString()}`;
}

function patientCurrencyFromTimezone(): SupportedCurrency {
  const timezone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "";
  return currencyForTimezone(timezone);
}

function amountInputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return Number.NaN;
  return Math.round(amount * 100);
}

export function DoctorSelectionSection() {
  const [doctors, setDoctors] = useState<DoctorCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMode, setLoadingMode] = useState<"replace" | "append" | null>(
    "replace",
  );
  const [error, setError] = useState<string | null>(null);

  const [specialty, setSpecialty] = useState("");
  const [consultationMode, setConsultationMode] = useState("");
  const [doctorNameSearch, setDoctorNameSearch] = useState("");
  const [debouncedDoctorNameSearch, setDebouncedDoctorNameSearch] =
    useState("");
  const [feeMinAmount, setFeeMinAmount] = useState("");
  const [feeMaxAmount, setFeeMaxAmount] = useState("");
  const [debouncedFeeMinAmount, setDebouncedFeeMinAmount] = useState("");
  const [debouncedFeeMaxAmount, setDebouncedFeeMaxAmount] = useState("");
  const [feeDurationMinutes, setFeeDurationMinutes] =
    useState<AllowedSlotDurationMinutes>(30);

  const [symptomInput, setSymptomInput] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const symptomBoxRef = useRef<HTMLDivElement | null>(null);
  const patientCurrency = useMemo(() => patientCurrencyFromTimezone(), []);
  const feeMinCents = useMemo(
    () => amountInputToCents(debouncedFeeMinAmount),
    [debouncedFeeMinAmount],
  );
  const feeMaxCents = useMemo(
    () => amountInputToCents(debouncedFeeMaxAmount),
    [debouncedFeeMaxAmount],
  );
  const feeRangeError = useMemo(() => {
    if (Number.isNaN(feeMinCents) || Number.isNaN(feeMaxCents)) {
      return "Please enter valid fee amounts.";
    }
    if (
      feeMinCents != null &&
      feeMaxCents != null &&
      feeMaxCents < feeMinCents
    ) {
      return "Max amount can't be smaller than min amount.";
    }
    return null;
  }, [feeMinCents, feeMaxCents]);
  const hasActiveFilters =
    Boolean(doctorNameSearch.trim()) ||
    Boolean(specialty) ||
    Boolean(consultationMode) ||
    Boolean(feeMinAmount.trim()) ||
    Boolean(feeMaxAmount.trim()) ||
    feeDurationMinutes !== 30 ||
    Boolean(symptomInput.trim());

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        specialty,
        consultationMode,
        debouncedDoctorNameSearch,
        debouncedFeeMinAmount,
        debouncedFeeMaxAmount,
        feeDurationMinutes,
        patientCurrency,
      }),
    [
      specialty,
      consultationMode,
      debouncedDoctorNameSearch,
      debouncedFeeMinAmount,
      debouncedFeeMaxAmount,
      feeDurationMinutes,
      patientCurrency,
    ],
  );

  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedFeeMinAmount(feeMinAmount);
      setDebouncedFeeMaxAmount(feeMaxAmount);
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [feeMinAmount, feeMaxAmount]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedDoctorNameSearch(doctorNameSearch);
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [doctorNameSearch]);

  const loadDoctors = useCallback(
    async (nextPage: number, append: boolean) => {
      const requestId = ++latestRequestIdRef.current;
      setLoading(true);
      setLoadingMode(append ? "append" : "replace");
      setError(null);
      if (!append) {
        setDoctors([]);
        setHasMore(false);
      }
      try {
        const res = await fetch(
          doctorListUrl({
            nameSearch: debouncedDoctorNameSearch,
            specialty,
            consultationMode,
            feeMinCents,
            feeMaxCents,
            feeDurationMinutes,
            patientCurrency,
            page: nextPage,
          }),
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (latestRequestIdRef.current !== requestId) return;
          setDoctors([]);
          setHasMore(false);
          setError(data?.error ?? "Failed to load doctors.");
          return;
        }
        const data = (await res.json()) as ListResponse;
        if (latestRequestIdRef.current !== requestId) return;
        const items = Array.isArray(data.items) ? data.items : [];
        setDoctors((cur) => (append ? [...cur, ...items] : items));
        setHasMore(Boolean(data.hasMore));
        setPage(typeof data.page === "number" ? data.page : nextPage);
      } catch {
        if (latestRequestIdRef.current !== requestId) return;
        setError("Failed to load doctors.");
      } finally {
        if (latestRequestIdRef.current === requestId) {
          setLoading(false);
          setLoadingMode(null);
        }
      }
    },
    [
      specialty,
      consultationMode,
      debouncedDoctorNameSearch,
      feeMinCents,
      feeMaxCents,
      feeDurationMinutes,
      patientCurrency,
    ],
  );

  useEffect(() => {
    if (feeRangeError) {
      latestRequestIdRef.current += 1;
      setLoading(false);
      setLoadingMode(null);
      setDoctors([]);
      setHasMore(false);
      setError(feeRangeError);
      return;
    }
    void loadDoctors(1, false);
  }, [filterKey, feeRangeError, loadDoctors]);

  const [sentryRef] = useInfiniteScroll({
    loading,
    hasNextPage: hasMore && !feeRangeError,
    onLoadMore: () => void loadDoctors(page + 1, true),
    disabled: false,
    rootMargin: "0px 0px 320px 0px",
  });

  const suggestions = useMemo(
    () => searchSymptoms(symptomInput, { limit: 12 }),
    [symptomInput],
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = symptomBoxRef.current;
      if (el && !el.contains(e.target as Node)) setShowSuggest(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const cardHref = (d: DoctorCard) =>
    d.slug ? `/doctors/${d.slug}` : `/book-appointment/${d.id}`;
  const clearAllFilters = useCallback(() => {
    setSpecialty("");
    setConsultationMode("");
    setDoctorNameSearch("");
    setDebouncedDoctorNameSearch("");
    setFeeMinAmount("");
    setFeeMaxAmount("");
    setDebouncedFeeMinAmount("");
    setDebouncedFeeMaxAmount("");
    setFeeDurationMinutes(30);
    setSymptomInput("");
    setShowSuggest(false);
  }, []);

  return (
    <section className="w-full bg-[#fafafa] py-6 md:py-10 lg:py-12">
      <Container>
        <div className="flex flex-col gap-2 text-left md:text-left">
          <h2 className="font-montaga text-2xl font-semibold leading-tight text-[#333333] md:text-3xl">
            Select a Doctor
          </h2>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-b border-[#e5e5e5] pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-montserrat text-xs text-[#777777]">
              Filter by symptom, specialty, mode, and fee.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="cursor-pointer font-montserrat text-xs text-[#777777] underline underline-offset-4 transition hover:text-[#2555F3]"
              >
                Clear all filters
              </button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label
                className="font-montserrat text-xs font-medium text-[#5e5e5e]"
                htmlFor="doctor-name-search"
              >
                Search by doctor name
              </label>
              <input
                id="doctor-name-search"
                type="text"
                value={doctorNameSearch}
                onChange={(e) => setDoctorNameSearch(e.target.value)}
                placeholder="e.g. Grace, Sharma…"
                className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#111111] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
                autoComplete="off"
              />
            </div>
            <div className="relative flex flex-col gap-1" ref={symptomBoxRef}>
              <label className="font-montserrat text-xs font-medium text-[#5e5e5e]">
                Search by symptom
              </label>
              <input
                type="text"
                value={symptomInput}
                onChange={(e) => {
                  setSymptomInput(e.target.value);
                  setShowSuggest(true);
                }}
                onFocus={() => setShowSuggest(true)}
                placeholder="e.g. chest pain, headache…"
                className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#111111] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
                autoComplete="off"
              />
              {showSuggest && suggestions.length > 0 && (
                <ul
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-xl border border-[#e5e5e5] bg-white py-1 shadow-md"
                  role="listbox"
                >
                  {suggestions.map((sym) => (
                    <li key={sym}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left font-montserrat text-sm text-[#333333] hover:bg-[#f5f5f5]"
                        onClick={() => {
                          const spec = specializationForSymptom(sym);
                          if (spec) setSpecialty(spec);
                          setSymptomInput(sym);
                          setShowSuggest(false);
                        }}
                      >
                        <span className="text-[#111111]">{sym}</span>
                        {specializationForSymptom(sym) && (
                          <span className="ml-2 text-xs text-[#777777]">
                            → {specializationForSymptom(sym)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1">
              <label
                className="font-montserrat text-xs font-medium text-[#5e5e5e]"
                htmlFor="filter-specialty"
              >
                Specialty
              </label>
              <select
                id="filter-specialty"
                value={specialty}
                onChange={(e) => {
                  setSpecialty(e.target.value);
                  setSymptomInput("");
                }}
                className={`w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] ${CHEVRON_CLASSES}`}
              >
                <option value="">All specialties</option>
                {DOCTOR_SPECIALIZATIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="font-montserrat text-xs font-medium text-[#5e5e5e]"
                htmlFor="filter-mode"
              >
                Consultation mode
              </label>
              <select
                id="filter-mode"
                value={consultationMode}
                onChange={(e) => setConsultationMode(e.target.value)}
                className={`w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] ${CHEVRON_CLASSES}`}
              >
                <option value="">Any</option>
                <option value="online">Online</option>
                <option value="clinic">Clinic</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="font-montserrat text-xs font-medium text-[#5e5e5e]"
                htmlFor="fee-duration"
              >
                Fee duration
              </label>
              <select
                id="fee-duration"
                value={feeDurationMinutes}
                onChange={(e) =>
                  setFeeDurationMinutes(
                    Number(e.target.value) as AllowedSlotDurationMinutes,
                  )
                }
                className={`w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] ${CHEVRON_CLASSES}`}
              >
                {ALLOWED_SLOT_DURATION_MINUTES.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration} min
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="font-montserrat text-xs font-medium text-[#5e5e5e]"
                htmlFor="fee-min"
              >
                Min fee for {feeDurationMinutes} min ({patientCurrency})
              </label>
              <input
                id="fee-min"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={feeMinAmount}
                onChange={(e) => setFeeMinAmount(e.target.value)}
                placeholder="15.00"
                className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="font-montserrat text-xs font-medium text-[#5e5e5e]"
                htmlFor="fee-max"
              >
                Max fee for {feeDurationMinutes} min ({patientCurrency})
              </label>
              <input
                id="fee-max"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={feeMaxAmount}
                onChange={(e) => setFeeMaxAmount(e.target.value)}
                placeholder="80.00"
                className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333]"
              />
            </div>
          </div>
        </div>

        {loadingMode === "replace" && (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:mt-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-sm"
              >
                <Skeleton className="aspect-4/3 w-full rounded-t-2xl bg-[#e5e5e5] min-[450px]:h-72 min-[450px]:aspect-auto sm:h-64" />
                <div className="flex flex-1 flex-col gap-3 px-5 py-4">
                  <Skeleton className="h-6 w-32 bg-[#e5e5e5] md:h-7" />
                  <Skeleton className="h-4 w-24 bg-[#e5e5e5]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-6 font-montserrat text-sm text-red-600">
            {error}
          </div>
        )}

        {loadingMode !== "replace" && !error && doctors.length === 0 && (
          <p className="mt-8 font-montserrat text-sm text-[#5e5e5e]">
            No doctors match these filters yet.
          </p>
        )}

        {loadingMode !== "replace" && doctors.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:mt-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {doctors.map((doctor) => (
              <article
                key={doctor.id}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#2555F3] hover:shadow-md"
              >
                <Link
                  href={cardHref(doctor)}
                  className="relative aspect-4/3 w-full overflow-hidden rounded-t-2xl bg-[#f5f5f5] min-[450px]:h-72 min-[450px]:aspect-auto sm:h-64"
                >
                  <DoctorProfilePhoto
                    src={doctor.profilePhotoUrl}
                    alt={formatDoctorDisplayName(doctor.name)}
                    slug={doctor.slug}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </Link>
                <div className="flex flex-1 flex-col gap-3 px-5 py-4">
                  <Link
                    href={cardHref(doctor)}
                    className="font-montaga text-lg text-[#111111] hover:text-[#2555F3] md:text-xl"
                  >
                    {formatDoctorDisplayName(doctor.name)}
                  </Link>
                  <span className="font-montserrat text-sm text-[#5E5E5E]">
                    {doctor.specialization}
                  </span>
                  <span className="font-montserrat text-xs text-[#777777]">
                    {doctor.qualification}
                  </span>
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Link
                      href={cardHref(doctor)}
                      className="inline-flex items-center justify-center rounded-full bg-[#2555F3] px-4 py-2 font-montserrat text-xs font-medium text-white transition hover:bg-[#1e44c7] focus:outline-none focus:ring-2 focus:ring-[#2555F3]/30 focus:ring-offset-2"
                    >
                      View profile
                    </Link>
                    <Link
                      href={`/book-appointment/${doctor.id}`}
                      className="inline-flex items-center justify-center rounded-full border border-[#d4d4d4] px-4 py-2 font-montserrat text-xs font-medium text-[#333333] transition hover:border-[#2555F3] hover:text-[#2555F3] focus:outline-none focus:ring-2 focus:ring-[#2555F3]/30 focus:ring-offset-2"
                    >
                      Book appointment
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {hasMore && !feeRangeError && (
          <div
            ref={sentryRef}
            aria-hidden="true"
            className="h-8 w-full shrink-0"
          />
        )}

        {loadingMode === "append" && doctors.length > 0 && (
          <p className="mt-6 text-center font-montserrat text-sm text-[#5e5e5e]">
            Loading…
          </p>
        )}
      </Container>
    </section>
  );
}
