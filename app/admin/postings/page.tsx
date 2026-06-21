"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { formatJobTypeLabel, formatSalaryDisplay, jobTypeValues } from "@/lib/careers-schemas";
import {
  activeBadgeClass,
  emptyPostingForm,
  formatCreatedDate,
  jobTypeBadgeClass,
  postingFormsEqual,
  PostingFormFields,
  SELECT_CHEVRON,
  type JobType,
  type PostingForm,
} from "@/lib/admin-careers-ui";
import type { SupportedCurrency } from "@/lib/currency";

type JobPosting = {
  id: string;
  title: string;
  description: string;
  type: JobType;
  isRemote: boolean;
  salaryRange: string | null;
  salaryCurrency: string | null;
  isActive: boolean;
  createdAt: string;
  applicationCount: number;
};

type TypeFilter = "ALL" | JobType;
type RemoteFilter = "ALL" | "remote" | "onsite";
type ActiveFilter = "ALL" | "active" | "inactive";

export default function AdminCareersPostingsPage() {
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [postingsCursor, setPostingsCursor] = useState<string | null>(null);
  const [postingsHasMore, setPostingsHasMore] = useState(false);
  const [postingsLoading, setPostingsLoading] = useState(true);
  const postingsRequestIdRef = useRef(0);

  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<PostingForm>(emptyPostingForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PostingForm>(emptyPostingForm);
  const [editBaseline, setEditBaseline] = useState<PostingForm | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [remoteFilter, setRemoteFilter] = useState<RemoteFilter>("ALL");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobPosting | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 500);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const loadPostings = useCallback(async (cursor: string | null, append: boolean) => {
    const requestId = ++postingsRequestIdRef.current;
    if (!append) {
      setPostings([]);
    }
    setPostingsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "10" });
      if (cursor) params.set("cursor", cursor);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (remoteFilter === "remote") params.set("remote", "true");
      if (remoteFilter === "onsite") params.set("remote", "false");
      if (activeFilter === "active") params.set("active", "true");
      if (activeFilter === "inactive") params.set("active", "false");
      const res = await fetch(`/api/admin/careers/postings?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (postingsRequestIdRef.current !== requestId) return;
      if (!res.ok) throw new Error(data.error ?? "Failed to load postings");
      const next = Array.isArray(data.items) ? data.items : [];
      setPostings((cur) => (append ? [...cur, ...next] : next));
      setPostingsHasMore(Boolean(data.hasMore));
      setPostingsCursor(data.nextCursor ?? null);
    } catch (err) {
      if (postingsRequestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : "Failed to load postings");
    } finally {
      if (postingsRequestIdRef.current === requestId) setPostingsLoading(false);
    }
  }, [activeFilter, debouncedSearch, remoteFilter, typeFilter]);

  useEffect(() => {
    void loadPostings(null, false);
  }, [loadPostings]);

  const hasActiveFilters =
    searchInput.trim() !== "" ||
    typeFilter !== "ALL" ||
    remoteFilter !== "ALL" ||
    activeFilter !== "ALL";

  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setTypeFilter("ALL");
    setRemoteFilter("ALL");
    setActiveFilter("ALL");
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
  }, []);

  const [postingsSentryRef] = useInfiniteScroll({
    loading: postingsLoading,
    hasNextPage: postingsHasMore,
    onLoadMore: () => {
      if (postingsCursor) void loadPostings(postingsCursor, true);
    },
    rootMargin: "0px 0px 300px 0px",
  });

  useEffect(() => {
    if (!deleteTarget) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyId) setDeleteTarget(null);
    }
    window.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [deleteTarget, busyId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusyId("create");
    setError(null);
    try {
      const res = await fetch("/api/careers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          salaryRange: createForm.salaryRange.trim() || null,
          salaryCurrency: createForm.salaryRange.trim()
            ? createForm.salaryCurrency
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create posting");
      setCreateForm(emptyPostingForm);
      setShowCreateForm(false);
      await loadPostings(null, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create posting");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpdate(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/careers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          salaryRange: editForm.salaryRange.trim() || null,
          salaryCurrency: editForm.salaryRange.trim()
            ? editForm.salaryCurrency
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update posting");
      setEditingId(null);
      await loadPostings(null, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update posting");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActive(posting: JobPosting) {
    setBusyId(posting.id);
    setError(null);
    try {
      const res = await fetch(`/api/careers/${posting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !posting.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update posting");
      await loadPostings(null, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update posting");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError(null);
    try {
      const res = await fetch(`/api/careers/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete posting");
      setDeleteTarget(null);
      await loadPostings(null, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete posting");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(posting: JobPosting) {
    const baseline: PostingForm = {
      title: posting.title,
      description: posting.description,
      type: posting.type,
      isRemote: posting.isRemote,
      salaryRange: posting.salaryRange ?? "",
      salaryCurrency:
        (posting.salaryCurrency as SupportedCurrency | null) ?? "USD",
      isActive: posting.isActive,
    };
    setEditingId(posting.id);
    setEditForm(baseline);
    setEditBaseline(baseline);
  }

  const editUnchanged =
    editBaseline !== null && postingFormsEqual(editForm, editBaseline);

  return (
    <div className="py-8 lg:py-10">
      <Container>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-montaga text-2xl text-[#333333] md:text-3xl">
              Job postings
            </h1>
            <p className="mt-1 font-montserrat text-sm text-[#5e5e5e]">
              Create and manage roles on the public careers page.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="cursor-pointer rounded-full bg-[#2555F3] font-montserrat text-sm hover:bg-[#1e44c7]"
          >
            {showCreateForm ? "Cancel" : "New posting"}
          </Button>
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#ffd0d0] bg-[#fff6f6] p-4">
            <p className="font-montserrat text-sm text-[#b42318]">{error}</p>
          </div>
        ) : null}

        {showCreateForm ? (
          <form
            onSubmit={handleCreate}
            className="mt-6 rounded-xl border border-[#e5e5e5] bg-white p-6"
          >
            <h2 className="font-montserrat text-lg font-semibold text-[#333333]">
              New job posting
            </h2>
            <div className="mt-4">
              <PostingFormFields
                form={createForm}
                onChange={setCreateForm}
                idPrefix="create"
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="submit"
                disabled={busyId === "create"}
                className="cursor-pointer rounded-full bg-[#2555F3] font-montserrat text-sm hover:bg-[#1e44c7]"
              >
                {busyId === "create" ? "Creating..." : "Create posting"}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="font-montserrat text-xs text-[#5E5E5E]">
            Filter by title, job type, location, and status.
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
            <label className="sr-only" htmlFor="admin-postings-search">
              Search by posting title
            </label>
            <div className="relative w-full">
              <input
                id="admin-postings-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by posting title..."
                className="w-full rounded-xl border border-[#e5e5e5] bg-white py-2 pl-3 pr-14 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-results-button]:hidden"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer font-montserrat text-sm text-[#5E5E5E] transition hover:text-[#2555F3]"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-[180px]">
            <label
              htmlFor="admin-postings-type-filter"
              className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
            >
              Job type
            </label>
            <select
              id="admin-postings-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className={`w-full cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
            >
              <option value="ALL">All types</option>
              {jobTypeValues.map((type) => (
                <option key={type} value={type}>
                  {formatJobTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-[180px]">
            <label
              htmlFor="admin-postings-remote-filter"
              className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
            >
              Location
            </label>
            <select
              id="admin-postings-remote-filter"
              value={remoteFilter}
              onChange={(e) => setRemoteFilter(e.target.value as RemoteFilter)}
              className={`w-full cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
            >
              <option value="ALL">All locations</option>
              <option value="remote">Remote</option>
              <option value="onsite">On-site</option>
            </select>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-[180px]">
            <label
              htmlFor="admin-postings-active-filter"
              className="shrink-0 font-montserrat text-sm font-medium text-[#333333]"
            >
              Status
            </label>
            <select
              id="admin-postings-active-filter"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              className={`w-full cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
            >
              <option value="ALL">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {postingsLoading && postings.length === 0 ? (
          <p className="mt-6 text-center font-montserrat text-sm text-[#5e5e5e]">
            Loading...
          </p>
        ) : postings.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
            <p className="font-montserrat text-sm text-[#5e5e5e]">
              No job postings yet.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {postings.map((posting) => {
              const isEditing = editingId === posting.id;
              const isBusy = busyId === posting.id;
              return (
                <article
                  key={posting.id}
                  className="rounded-xl border border-[#e5e5e5] bg-white p-5"
                >
                  {isEditing ? (
                    <>
                      <PostingFormFields
                        form={editForm}
                        onChange={setEditForm}
                        idPrefix={`edit-${posting.id}`}
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          disabled={isBusy || editUnchanged}
                          onClick={() => void handleUpdate(posting.id)}
                          className="cursor-pointer rounded-full bg-[#2555F3] font-montserrat text-sm hover:bg-[#1e44c7]"
                        >
                          {isBusy ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => setEditingId(null)}
                          className="cursor-pointer rounded-full font-montserrat text-sm"
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-montserrat text-base font-semibold text-[#333333]">
                            {posting.title}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={jobTypeBadgeClass(posting.type)}>
                              {formatJobTypeLabel(posting.type)}
                            </span>
                            {posting.isRemote ? (
                              <span className="inline-flex items-center rounded-full border border-[#d7e4ff] bg-[#eef3ff] px-2.5 py-1 font-montserrat text-xs font-medium text-[#2555F3]">
                                Remote
                              </span>
                            ) : null}
                            <span className={activeBadgeClass(posting.isActive)}>
                              {posting.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>
                        <p className="font-montserrat text-xs text-[#5e5e5e]">
                          {posting.applicationCount} application
                          {posting.applicationCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      {formatSalaryDisplay(
                        posting.salaryRange,
                        posting.salaryCurrency,
                      ) ? (
                        <p className="mt-2 font-montserrat text-sm text-[#5e5e5e]">
                          {formatSalaryDisplay(
                            posting.salaryRange,
                            posting.salaryCurrency,
                          )}
                        </p>
                      ) : null}
                      <p className="mt-3 whitespace-pre-wrap font-montserrat text-sm text-[#333333]">
                        {posting.description}
                      </p>
                      <p className="mt-2 font-montserrat text-xs text-[#5e5e5e]">
                        Posted {formatCreatedDate(posting.createdAt)}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => startEdit(posting)}
                          className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 font-montserrat text-xs font-medium text-[#333333] transition-colors hover:bg-[#fafafa] disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleToggleActive(posting)}
                          className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 font-montserrat text-xs font-medium text-[#333333] transition-colors hover:bg-[#fafafa] disabled:opacity-60"
                        >
                          {isBusy
                            ? "Updating..."
                            : posting.isActive
                              ? "Deactivate"
                              : "Activate"}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDeleteTarget(posting)}
                          className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 font-montserrat text-xs font-medium text-[#b42318] transition-colors hover:bg-[#fafafa] disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
            {(postingsHasMore || postingsLoading) && postings.length > 0 && (
              <div
                ref={postingsSentryRef}
                className="py-4 text-center font-montserrat text-sm text-[#5e5e5e]"
              >
                {postingsLoading ? "Loading..." : "Scroll for more"}
              </div>
            )}
          </div>
        )}
      </Container>

      {mounted && deleteTarget
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
                <h3 className="font-montserrat text-lg font-semibold text-[#333333]">
                  Delete job posting?
                </h3>
                <p className="mt-2 font-montserrat text-sm text-[#5e5e5e]">
                  This will permanently delete &ldquo;{deleteTarget.title}
                  &rdquo; and all associated applications.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyId === deleteTarget.id}
                    onClick={() => setDeleteTarget(null)}
                    className="cursor-pointer rounded-full font-montserrat text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={busyId === deleteTarget.id}
                    onClick={() => void handleDelete()}
                    className="cursor-pointer rounded-full bg-[#b42318] font-montserrat text-sm hover:bg-[#912018]"
                  >
                    {busyId === deleteTarget.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
