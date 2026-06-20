"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { Container } from "@/components/layout/Container";
import { DoctorProfilePhoto } from "@/components/doctor/DoctorProfilePhoto";
import { formatDoctorDisplayName } from "@/lib/doctor-name";

type ApprovalTab = "PENDING" | "APPROVED" | "REJECTED";
type ActivityTab = "active" | "inactive";

type AdminDoctor = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  specialization: string;
  licenseNumber: string;
  yearsExperience: number | null;
  profilePhotoUrl: string;
  approvalStatus: ApprovalTab;
  isActive: boolean;
  createdAt: string;
};

type DeactivationImpact = {
  futurePaidOnlineCount: number;
  futureClinicCount: number;
  futureOnlineUnpaidCount: number;
  totalFutureCount: number;
  farthestAppointment: {
    doctorDateLabel: string;
    doctorTimeLabel: string;
    doctorTimezone: string;
    viewerDateLabel?: string;
    viewerTimeLabel?: string;
    viewerTimezone?: string;
  } | null;
};

/** Hide native select arrow; custom chevron at `right: 0.75rem` with `pr-10` inset. */
const SELECT_CHEVRON =
  'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23333333%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:1rem_1rem] bg-[position:right_0.75rem_center] bg-no-repeat';

const tabItems: Array<{ key: ApprovalTab; label: string }> = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

const activityItems: Array<{ key: ActivityTab; label: string }> = [
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

function statusBadgeClass(status: ApprovalTab) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 font-montserrat text-xs font-medium";
  if (status === "APPROVED") return `${base} border-[#d7f2d9] bg-[#effcf0] text-[#1f7a36]`;
  if (status === "REJECTED") return `${base} border-[#ffd9d9] bg-[#fff1f1] text-[#b42318]`;
  return `${base} border-[#ffe7b8] bg-[#fff8eb] text-[#9a6700]`;
}

function formatCreatedDate(value: string) {
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

export default function AdminDoctorsPage() {
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeTab, setActiveTab] = useState<ApprovalTab>("PENDING");
  const [activityTab, setActivityTab] = useState<ActivityTab>("active");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyDoctorId, setBusyDoctorId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDoctor | null>(null);
  const [deactivationImpact, setDeactivationImpact] =
    useState<DeactivationImpact | null>(null);
  const [deactivationImpactLoading, setDeactivationImpactLoading] =
    useState(false);
  const [mounted, setMounted] = useState(false);
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 500);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (!deleteTarget) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyDoctorId) {
        setDeleteTarget(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [deleteTarget, busyDoctorId]);

  useEffect(() => {
    if (!deleteTarget) {
      setDeactivationImpact(null);
      setDeactivationImpactLoading(false);
      return;
    }
    let cancelled = false;
    setDeactivationImpact(null);
    setDeactivationImpactLoading(true);
    const viewerTz =
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "";
    const viewerParam =
      viewerTz.length > 0
        ? `?viewerTz=${encodeURIComponent(viewerTz)}`
        : "";
    void fetch(`/api/admin/doctors/${deleteTarget.id}${viewerParam}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as DeactivationImpact;
        if (cancelled) return;
        setDeactivationImpact(data);
      })
      .catch(() => {
        if (!cancelled) setDeactivationImpact(null);
      })
      .finally(() => {
        if (!cancelled) setDeactivationImpactLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deleteTarget]);

  const loadDoctors = useCallback(async (nextPage: number, append: boolean) => {
    const requestId = ++latestRequestIdRef.current;
    if (!append) {
      setDoctors([]);
    }
    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingInitial(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: "10",
        activity: activityTab,
      });
      if (activityTab === "active") {
        params.set("status", activeTab);
      }
      if (debouncedSearch) params.set("search", debouncedSearch);
      const response = await fetch(`/api/admin/doctors?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (latestRequestIdRef.current !== requestId) return;
        setError("Failed to load doctors.");
        return;
      }
      const data = (await response.json()) as {
        items?: AdminDoctor[];
        hasMore?: boolean;
        page?: number;
      };
      if (latestRequestIdRef.current !== requestId) return;
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setDoctors((current) => (append ? [...current, ...nextItems] : nextItems));
      setHasMore(Boolean(data.hasMore));
      setPage(typeof data.page === "number" ? data.page : nextPage);
    } catch {
      if (latestRequestIdRef.current !== requestId) return;
      setError("Failed to load doctors.");
    } finally {
      if (latestRequestIdRef.current !== requestId) return;
      if (append) {
        setLoadingMore(false);
      } else {
        setLoadingInitial(false);
      }
    }
  }, [activeTab, activityTab, debouncedSearch]);

  useEffect(() => {
    void loadDoctors(1, false);
  }, [loadDoctors]);

  const [sentryRef] = useInfiniteScroll({
    loading: loadingMore,
    hasNextPage: hasMore,
    onLoadMore: () => void loadDoctors(page + 1, true),
    disabled: loadingInitial,
    rootMargin: "0px 0px 300px 0px",
  });

  const approvalFilterDisabled = activityTab === "inactive";

  const handleActivityTabChange = useCallback((next: ActivityTab) => {
    if (next === "active") {
      setActivityTab("active");
      setActiveTab("PENDING");
    } else {
      setActivityTab("inactive");
    }
  }, []);

  const handleAction = async (doctor: AdminDoctor, action: "approve" | "reject") => {
    if (!doctor.userId) return;
    setBusyDoctorId(doctor.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/doctors/${doctor.id}/approval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: action === "approve" ? "APPROVED" : "REJECTED",
        }),
      });
      if (!response.ok) {
        setError(
          action === "approve"
            ? "Failed to approve doctor. Please try again."
            : "Failed to reject doctor. Please try again.",
        );
        return;
      }
      await loadDoctors(1, false);
    } catch {
      setError(
        action === "approve"
          ? "Failed to approve doctor. Please try again."
          : "Failed to reject doctor. Please try again.",
      );
    } finally {
      setBusyDoctorId(null);
    }
  };

  const handleReactivate = async (doctor: AdminDoctor) => {
    setBusyDoctorId(doctor.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/doctors/${doctor.id}`, {
        method: "PATCH",
      });
      if (!response.ok) {
        setError("Failed to reactivate doctor. Please try again.");
        return;
      }
      await loadDoctors(1, false);
    } catch {
      setError("Failed to reactivate doctor. Please try again.");
    } finally {
      setBusyDoctorId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setBusyDoctorId(deleteTarget.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/doctors/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("Failed to deactivate doctor. Please try again.");
        return;
      }
      setDeleteTarget(null);
      await loadDoctors(1, false);
    } catch {
      setError("Failed to deactivate doctor. Please try again.");
    } finally {
      setBusyDoctorId(null);
    }
  };

  const visibleDoctors = useMemo(() => doctors, [doctors]);

  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
          <h1 className="font-montaga text-2xl font-semibold text-[#333333] md:text-3xl">
            Doctors
          </h1>
          <p className="mt-2 max-w-2xl font-montserrat text-sm text-[#5e5e5e]">
            Review doctor profiles and manage approval status.
          </p>

          <div className="mt-6">
            <label className="sr-only" htmlFor="admin-doctors-search">
              Search doctors
            </label>
            <input
              id="admin-doctors-search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by doctor name or email"
              className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
            />
          </div>

          <div className="mt-4 grid gap-3 md:hidden">
            <label className="sr-only" htmlFor="admin-doctor-activity">
              Filter doctors by activity
            </label>
            <select
              id="admin-doctor-activity"
              value={activityTab}
              onChange={(event) =>
                handleActivityTabChange(event.target.value as ActivityTab)
              }
              className={`cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
            >
              {activityItems.map((tab) => (
                <option key={tab.key} value={tab.key}>
                  {tab.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="admin-doctor-tab">
              Filter doctors by status
            </label>
            <select
              id="admin-doctor-tab"
              value={activeTab}
              disabled={approvalFilterDisabled}
              aria-disabled={approvalFilterDisabled}
              onChange={(event) => setActiveTab(event.target.value as ApprovalTab)}
              className={`rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON} ${
                approvalFilterDisabled
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer"
              }`}
            >
              {tabItems.map((tab) => (
                <option key={tab.key} value={tab.key}>
                  {tab.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 hidden flex-wrap gap-2 md:flex">
            {activityItems.map((tab) => {
              const active = activityTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleActivityTabChange(tab.key)}
                  className={`cursor-pointer rounded-full px-4 py-2 font-montserrat text-sm transition-colors ${
                    active
                      ? "bg-[#111827] text-white"
                      : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 hidden flex-wrap gap-2 md:flex">
            {tabItems.map((tab) => {
              const selected = !approvalFilterDisabled && activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  disabled={approvalFilterDisabled}
                  aria-disabled={approvalFilterDisabled}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full px-4 py-2 font-montserrat text-sm transition-colors ${
                    approvalFilterDisabled
                      ? "cursor-not-allowed border border-[#e5e5e5] bg-[#f3f4f6] text-[#9ca3af]"
                      : selected
                        ? "cursor-pointer bg-[#2555F3] text-white"
                        : "cursor-pointer border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#ffd0d0] bg-[#fff6f6] p-4">
              <p className="font-montserrat text-sm text-[#b42318]">{error}</p>
            </div>
          ) : null}

          {loadingInitial && visibleDoctors.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
              <p className="font-montserrat text-sm text-[#5e5e5e]">Loading doctors...</p>
            </div>
          ) : !loadingInitial && visibleDoctors.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
              <p className="font-montserrat text-sm text-[#5e5e5e]">
                No doctors found for this filter.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 overflow-x-auto rounded-xl border border-[#e5e5e5]">
                <table className="min-w-[980px] w-full border-collapse bg-white">
                  <thead className="bg-[#fafafa]">
                    <tr>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Doctor
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Email
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Specialization
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        License
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Experience
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Created
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDoctors.map((doctor) => {
                      const isBusy = busyDoctorId === doctor.id;
                      const hasAccount = Boolean(doctor.userId);
                      return (
                        <tr key={doctor.id} className="border-t border-[#ededed] align-top">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              <div className="relative h-10 w-10 overflow-hidden rounded-full border border-[#e5e5e5] bg-[#f5f5f5]">
                                <DoctorProfilePhoto
                                  src={doctor.profilePhotoUrl}
                                  alt={doctor.name}
                                  fill
                                  sizes="40px"
                                />
                              </div>
                              <p className="font-montserrat text-sm font-medium text-[#333333]">
                                {doctor.name}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-3 font-montserrat text-sm text-[#5e5e5e]">
                            {doctor.email ?? "—"}
                          </td>
                          <td className="px-3 py-3 font-montserrat text-sm text-[#333333]">
                            {doctor.specialization}
                          </td>
                          <td className="px-3 py-3 font-montserrat text-sm text-[#333333]">
                            {doctor.licenseNumber}
                          </td>
                          <td className="px-3 py-3 font-montserrat text-sm text-[#333333]">
                            {doctor.yearsExperience != null
                              ? `${doctor.yearsExperience} yrs`
                              : "—"}
                          </td>
                          <td className="px-3 py-3 font-montserrat text-sm text-[#5e5e5e]">
                            {formatCreatedDate(doctor.createdAt)}
                          </td>
                          <td className="px-3 py-3">
                            {activityTab === "inactive" ? (
                              doctor.approvalStatus === "APPROVED" ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleReactivate(doctor)}
                                  className="cursor-pointer rounded-lg bg-[#2555F3] px-3 py-1.5 font-montserrat text-xs font-medium text-white transition-colors hover:bg-[#1e44c7] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Reactivate
                                </button>
                              ) : (
                                <span
                                  className={statusBadgeClass(doctor.approvalStatus)}
                                >
                                  {doctor.approvalStatus === "REJECTED"
                                    ? "Rejected"
                                    : "Pending"}
                                </span>
                              )
                            ) : activeTab === "PENDING" ? (
                              hasAccount ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleAction(doctor, "approve")}
                                    className="cursor-pointer rounded-lg bg-[#2555F3] px-3 py-1.5 font-montserrat text-xs font-medium text-white transition-colors hover:bg-[#1e44c7] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleAction(doctor, "reject")}
                                    className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 font-montserrat text-xs font-medium text-[#b42318] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="font-montserrat text-sm text-[#9ca3af]">
                                  —
                                </span>
                              )
                            ) : activeTab === "APPROVED" ? (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setDeleteTarget(doctor)}
                                className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 font-montserrat text-xs font-medium text-[#b42318] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Delete
                              </button>
                            ) : (
                              <span className={statusBadgeClass("REJECTED")}>
                                Rejected
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(hasMore || loadingMore) && visibleDoctors.length > 0 && (
                <div
                  ref={sentryRef}
                  className="py-4 text-center font-montserrat text-sm text-[#5E5E5E]"
                >
                  {loadingMore ? "Loading..." : "Scroll for more"}
                </div>
              )}
            </>
          )}
        </section>
      </Container>
      {mounted &&
        deleteTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-100 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-doctor-delete-title"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-black/40"
              aria-label="Close dialog"
              onClick={() => {
                if (!busyDoctorId) {
                  setDeleteTarget(null);
                }
              }}
            />
            <div
              className="relative z-1 w-full max-w-lg rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <h2
                id="admin-doctor-delete-title"
                className="font-montaga text-xl font-semibold text-[#333333]"
              >
                Deactivate doctor?
              </h2>
              <p className="mt-3 font-montserrat text-sm leading-relaxed text-[#5E5E5E]">
                <span className="font-medium text-[#333333]">
                  {formatDoctorDisplayName(deleteTarget.name)}
                </span>{" "}
                will be marked inactive and hidden from public booking. Existing upcoming
                appointments are not auto-cancelled — the doctor can sign in to view and cancel
                them from their dashboard (refunds follow your cancellation policy). Past records
                are preserved.
              </p>
              <div className="mt-4 rounded-lg border border-[#ededed] bg-[#fafafa] p-4 font-montserrat text-sm text-[#333333]">
                {deactivationImpactLoading ? (
                  <p className="text-[#5E5E5E]">Loading upcoming appointments…</p>
                ) : deactivationImpact ? (
                  <>
                    {deactivationImpact.totalFutureCount === 0 ? (
                      <p className="text-[#5E5E5E]">
                        No upcoming appointments on the schedule.
                      </p>
                    ) : (
                      <>
                        <p className="mb-2 text-[#5E5E5E]">
                          Upcoming appointments that remain for the doctor to manage from their
                          dashboard:
                        </p>
                        <ul className="list-disc space-y-2 pl-5 text-[#333333]">
                          <li>
                            <span className="font-medium">Online (paid)</span>
                            {": "}
                            {deactivationImpact.futurePaidOnlineCount}{" "}
                            {deactivationImpact.futurePaidOnlineCount === 1
                              ? "appointment"
                              : "appointments"}
                          </li>
                          <li>
                            <span className="font-medium">Clinic visits</span>
                            {": "}
                            {deactivationImpact.futureClinicCount}{" "}
                            {deactivationImpact.futureClinicCount === 1
                              ? "appointment"
                              : "appointments"}
                          </li>
                          {deactivationImpact.futureOnlineUnpaidCount > 0 ? (
                            <li>
                              <span className="font-medium">Online (unpaid)</span>
                              {": "}
                              {deactivationImpact.futureOnlineUnpaidCount}{" "}
                              {deactivationImpact.futureOnlineUnpaidCount === 1
                                ? "appointment"
                                : "appointments"}
                            </li>
                          ) : null}
                        </ul>
                        {deactivationImpact.farthestAppointment ? (
                          <div className="mt-3 space-y-2 text-[#5E5E5E]">
                            <p>
                              <span className="font-medium text-[#333333]">
                                Farthest upcoming appointment
                              </span>
                              {deactivationImpact.farthestAppointment
                                .viewerDateLabel != null &&
                              deactivationImpact.farthestAppointment
                                .viewerTimeLabel != null &&
                              deactivationImpact.farthestAppointment
                                .viewerTimezone != null ? (
                                <>
                                  {": "}
                                  {
                                    deactivationImpact.farthestAppointment
                                      .viewerDateLabel
                                  }{" "}
                                  at{" "}
                                  {
                                    deactivationImpact.farthestAppointment
                                      .viewerTimeLabel
                                  }
                                  <span className="text-[#5E5E5E]">
                                    {" "}
                                    (
                                    {
                                      deactivationImpact.farthestAppointment
                                        .viewerTimezone
                                    }
                                    , your time)
                                  </span>
                                </>
                              ) : (
                                <>
                                  {": "}
                                  {
                                    deactivationImpact.farthestAppointment
                                      .doctorDateLabel
                                  }{" "}
                                  at{" "}
                                  {
                                    deactivationImpact.farthestAppointment
                                      .doctorTimeLabel
                                  }
                                  <span className="text-[#5E5E5E]">
                                    {" "}
                                    (
                                    {
                                      deactivationImpact.farthestAppointment
                                        .doctorTimezone
                                    }
                                    )
                                  </span>
                                </>
                              )}
                            </p>
                            {deactivationImpact.farthestAppointment
                              .viewerDateLabel != null &&
                            deactivationImpact.farthestAppointment
                              .viewerTimezone != null ? (
                              <p className="text-xs text-[#6b7280]">
                                Doctor&apos;s local:{" "}
                                {
                                  deactivationImpact.farthestAppointment
                                    .doctorDateLabel
                                }{" "}
                                at{" "}
                                {
                                  deactivationImpact.farthestAppointment
                                    .doctorTimeLabel
                                }{" "}
                                (
                                {
                                  deactivationImpact.farthestAppointment
                                    .doctorTimezone
                                }
                                )
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-[#5E5E5E]">
                    Could not load appointment summary. You can still deactivate the doctor.
                  </p>
                )}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  className="cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-4 py-2.5 font-montserrat text-sm font-medium text-[#333333] transition-colors hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => setDeleteTarget(null)}
                  disabled={Boolean(busyDoctorId)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="cursor-pointer rounded-xl bg-[#dc2626] px-4 py-2.5 font-montserrat text-sm font-medium text-white transition-colors hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleDeleteConfirm()}
                  disabled={Boolean(busyDoctorId) || deactivationImpactLoading}
                >
                  {busyDoctorId
                    ? "Deactivating..."
                    : deactivationImpactLoading
                      ? "Loading impact..."
                      : "Deactivate doctor"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
