"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { Container } from "@/components/layout/Container";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { RatingStars } from "@/components/reviews/RatingStars";
import { Skeleton } from "@/components/ui/skeleton";

type RatingFilter = "ALL" | "1" | "2" | "3" | "4" | "5";

type AdminReview = {
  id: string;
  patientName: string | null;
  doctorName: string;
  rating: number;
  comment: string;
  createdAt: string;
};

/** Hide native select arrow; custom chevron at `right: 0.75rem` with `pr-10` inset. */
const SELECT_CHEVRON =
  'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23333333%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:1rem_1rem] bg-[position:right_0.75rem_center] bg-no-repeat';

const ratingOptions: Array<{ key: RatingFilter; label: string }> = [
  { key: "ALL", label: "All ratings" },
  { key: "5", label: "5 stars" },
  { key: "4", label: "4 stars" },
  { key: "3", label: "3 stars" },
  { key: "2", label: "2 stars" },
  { key: "1", label: "1 star" },
];

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

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("ALL");
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminReview | null>(null);
  const [mounted, setMounted] = useState(false);
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!deleteTarget) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyReviewId) {
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
  }, [deleteTarget, busyReviewId]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 500);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const loadReviews = useCallback(async (nextPage: number, append: boolean) => {
    const requestId = ++latestRequestIdRef.current;
    if (!append) {
      setReviews([]);
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
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (ratingFilter !== "ALL") params.set("rating", ratingFilter);

      const response = await fetch(`/api/admin/reviews?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        if (latestRequestIdRef.current !== requestId) return;
        setError("Failed to load reviews.");
        return;
      }

      const data = (await response.json()) as {
        items?: AdminReview[];
        hasMore?: boolean;
        page?: number;
      };

      if (latestRequestIdRef.current !== requestId) return;
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setReviews((current) => (append ? [...current, ...nextItems] : nextItems));
      setHasMore(Boolean(data.hasMore));
      setPage(typeof data.page === "number" ? data.page : nextPage);
    } catch {
      if (latestRequestIdRef.current !== requestId) return;
      setError("Failed to load reviews.");
    } finally {
      if (latestRequestIdRef.current !== requestId) return;
      if (append) {
        setLoadingMore(false);
      } else {
        setLoadingInitial(false);
      }
    }
  }, [debouncedSearch, ratingFilter]);

  useEffect(() => {
    void loadReviews(1, false);
  }, [loadReviews]);

  const [sentryRef] = useInfiniteScroll({
    loading: loadingMore,
    hasNextPage: hasMore,
    onLoadMore: () => void loadReviews(page + 1, true),
    disabled: loadingInitial,
    rootMargin: "0px 0px 300px 0px",
  });

  const hasActiveFilters =
    searchInput.trim() !== "" || ratingFilter !== "ALL";

  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setRatingFilter("ALL");
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setBusyReviewId(deleteTarget.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/reviews/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("Failed to delete review. Please try again.");
        return;
      }

      setDeleteTarget(null);
      await loadReviews(1, false);
    } catch {
      setError("Failed to delete review. Please try again.");
    } finally {
      setBusyReviewId(null);
    }
  };

  const visibleReviews = useMemo(() => reviews, [reviews]);

  return (
    <div className="w-full bg-[#fafafa] py-6 md:py-8">
      <Container>
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm md:p-8">
          <h1 className="font-montaga text-2xl font-semibold text-[#333333] md:text-3xl">
            Reviews
          </h1>
          <p className="mt-2 max-w-2xl font-montserrat text-sm text-[#5e5e5e]">
            Review patient feedback and remove inappropriate submissions.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="font-montserrat text-xs text-[#5E5E5E]">
              Filter by doctor name and rating.
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

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
            <div>
              <label className="sr-only" htmlFor="admin-reviews-search">
                Search by doctor name
              </label>
              <input
                id="admin-reviews-search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by doctor name"
                className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
              />
            </div>

            <div>
              <label className="sr-only" htmlFor="admin-reviews-rating-filter">
                Filter by rating
              </label>
              <select
                id="admin-reviews-rating-filter"
                value={ratingFilter}
                onChange={(event) => setRatingFilter(event.target.value as RatingFilter)}
                className={`w-full cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] shadow-sm outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 ${SELECT_CHEVRON}`}
              >
                {ratingOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#ffd0d0] bg-[#fff6f6] p-4">
              <p className="font-montserrat text-sm text-[#b42318]">{error}</p>
            </div>
          ) : null}

          {loadingInitial && visibleReviews.length === 0 ? (
            <div className="mt-6 overflow-x-auto rounded-xl border border-[#e5e5e5]">
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
                      Rating
                    </th>
                    <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                      Review
                    </th>
                    <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                      Date
                    </th>
                    <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-[#ededed]">
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-28 bg-[#e5e5e5]" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-32 bg-[#e5e5e5]" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-5 w-16 bg-[#e5e5e5]" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-12 w-full max-w-md bg-[#e5e5e5]" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-24 bg-[#e5e5e5]" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-8 w-16 bg-[#e5e5e5]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !loadingInitial && visibleReviews.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
              <p className="font-montserrat text-sm text-[#5e5e5e]">
                No reviews found for this filter.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 overflow-x-auto rounded-xl border border-[#e5e5e5]">
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
                        Rating
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Review
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Date
                      </th>
                      <th className="px-3 py-3 text-left font-montserrat text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReviews.map((review) => {
                      const isBusy = busyReviewId === review.id;
                      return (
                        <tr key={review.id} className="border-t border-[#ededed] align-top">
                          <td className="px-3 py-3 font-montserrat text-sm font-medium text-[#333333]">
                            {review.patientName ?? "Unknown patient"}
                          </td>
                          <td className="px-3 py-3 font-montserrat text-sm text-[#333333]">
                            {review.doctorName}
                          </td>
                          <td className="px-3 py-3">
                            <RatingStars rating={review.rating} showValue />
                          </td>
                          <td className="px-3 py-3 font-montserrat text-sm text-[#333333]">
                            <p className="max-w-xl whitespace-pre-wrap wrap-break-word">
                              {review.comment}
                            </p>
                          </td>
                          <td className="px-3 py-3 font-montserrat text-sm text-[#5e5e5e]">
                            {formatCreatedDate(review.createdAt)}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDeleteTarget(review)}
                              className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 font-montserrat text-xs font-medium text-[#b42318] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isBusy ? "Deleting..." : "Delete"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(hasMore || loadingMore) && visibleReviews.length > 0 && (
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
            aria-labelledby="admin-review-delete-title"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-black/40"
              aria-label="Close dialog"
              onClick={() => {
                if (!busyReviewId) {
                  setDeleteTarget(null);
                }
              }}
            />
            <div
              className="relative z-1 w-full max-w-md rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <h2
                id="admin-review-delete-title"
                className="font-montaga text-xl font-semibold text-[#333333]"
              >
                Delete review?
              </h2>
              <p className="mt-3 font-montserrat text-sm leading-relaxed text-[#5E5E5E]">
                This will permanently remove the review from{" "}
                <span className="font-medium text-[#333333]">
                  {deleteTarget.patientName ?? "Unknown patient"}
                </span>{" "}
                for{" "}
                <span className="font-medium text-[#333333]">
                  {formatDoctorDisplayName(deleteTarget.doctorName)}
                </span>
                .
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  className="cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-4 py-2.5 font-montserrat text-sm font-medium text-[#333333] transition-colors hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => setDeleteTarget(null)}
                  disabled={Boolean(busyReviewId)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="cursor-pointer rounded-xl bg-[#dc2626] px-4 py-2.5 font-montserrat text-sm font-medium text-white transition-colors hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleDeleteConfirm()}
                  disabled={Boolean(busyReviewId)}
                >
                  {busyReviewId ? "Deleting..." : "Delete review"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
