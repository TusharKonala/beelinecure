"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { Container } from "@/components/layout/Container";
import {
  CareersJobPostingSummary,
  type JobPostingSummaryData,
} from "@/components/careers-job-posting-summary";

export default function CareersPage() {
  const [postings, setPostings] = useState<JobPostingSummaryData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 500);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const loadPostings = useCallback(async (nextCursor: string | null, append: boolean) => {
    const requestId = ++requestIdRef.current;
    if (!append) setRefreshing(true);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "6" });
      if (nextCursor) params.set("cursor", nextCursor);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/careers?${params}`);
      const data = await res.json();
      if (requestIdRef.current !== requestId) return;
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load job postings");
      }
      const next = Array.isArray(data.items) ? data.items : [];
      setPostings((cur) => (append ? [...cur, ...next] : next));
      setHasMore(Boolean(data.hasMore));
      setCursor(data.nextCursor ?? null);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(
        err instanceof Error ? err.message : "Failed to load job postings",
      );
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
        if (!append) setRefreshing(false);
      }
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void loadPostings(null, false);
  }, [loadPostings]);

  const [sentryRef] = useInfiniteScroll({
    loading,
    hasNextPage: hasMore,
    onLoadMore: () => {
      if (cursor) void loadPostings(cursor, true);
    },
    rootMargin: "0px 0px 300px 0px",
  });

  return (
    <>
      <div className="border-b border-[#2555F3]/10 bg-gradient-to-br from-[#F0F7FF] to-[#E6F2FF] px-6 py-3">
        <p className="mx-auto max-w-4xl text-center font-montserrat text-xs leading-relaxed text-[#2555F3] md:text-sm">
          This is a live demo — Apply for a role and see how the
          candidate-facing experience works. AI screening and interview
          scheduling happens on the clinic&apos;s end.
        </p>
      </div>
      <main className="py-12 md:py-16">
        <Container>
        <div className="max-w-3xl">
          <h1 className="font-montaga text-3xl text-[#333333] md:text-4xl">
            Careers at BeelineCure
          </h1>
          <p className="mt-3 font-montserrat text-base text-[#5e5e5e]">
            Join our team and help make healthcare more accessible.
          </p>
        </div>

        <div className="relative mt-8 w-full max-w-md">
          <label className="sr-only" htmlFor="careers-search">
            Search job postings
          </label>
          <input
            id="careers-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by job title..."
            className="w-full rounded-xl border border-[#e5e5e5] bg-white py-2 pl-3 pr-14 font-montserrat text-sm text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-results-button]:hidden"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer font-montserrat text-sm text-[#5E5E5E] transition hover:text-[#2555F3]"
            >
              Clear
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="mt-8 rounded-xl border border-dashed border-[#ffd0d0] bg-[#fff6f6] p-4">
            <p className="font-montserrat text-sm text-[#b42318]">{error}</p>
          </div>
        ) : null}

        {refreshing ? (
          <p className="mt-10 font-montserrat text-sm text-[#5e5e5e]">
            Loading openings...
          </p>
        ) : postings.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-8 text-center">
            <p className="font-montserrat text-sm text-[#5e5e5e]">
              No open positions at the moment. Check back soon.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {postings.map((posting) => (
              <article
                key={posting.id}
                className="flex flex-col rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-sm"
              >
                <CareersJobPostingSummary
                  posting={posting}
                  truncateDescription
                  showApplyButton
                />
              </article>
            ))}
            {(hasMore || loading) && postings.length > 0 && (
              <div
                ref={sentryRef}
                className="col-span-full py-4 text-center font-montserrat text-sm text-[#5e5e5e]"
              >
                {loading ? "Loading..." : "Scroll for more"}
              </div>
            )}
          </div>
        )}
        </Container>
      </main>
    </>
  );
}
