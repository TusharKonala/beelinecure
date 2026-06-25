"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import {
  applicationStatusDropdownValues,
  applicationStatusValues,
  countInterviewCancellationReasonChars,
  countInterviewNotesChars,
  INTERVIEW_CANCELLATION_REASON_MAX_CHARS,
  INTERVIEW_NOTES_MAX_CHARS,
  MAX_INTERVIEW_ROUNDS,
} from "@/lib/careers-schemas";
import { CharCountFooter } from "@/components/form/CharCountFooter";
import {
  buildGmailComposeUrl,
  buildOfferEmailBody,
  buildOfferEmailSubject,
  canMarkApplicationAsHired,
  HIRE_BLOCKED_INCOMPLETE_INTERVIEWS_MESSAGE,
} from "@/lib/careers-hire-compose";
import {
  aiScoreBadgeClass,
  formatCreatedDate,
  scoreBandParams,
  shortlistedScoreParams,
  SELECT_CHEVRON,
  statusBadgeClass,
  type ApplicationStatus,
  type ScoreBand,
  type ShortlistedScore,
} from "@/lib/admin-careers-ui";
import {
  defaultInterviewTimezone,
  formatDatetimeLocalInTimezone,
  formatInterviewTime,
  INTERVIEW_TIMEZONE_OPTIONS,
  minDatetimeLocalForTimezone,
  parseDatetimeLocalInTimezone,
} from "@/lib/careers-interview-time";
import { useApplicationsListPoll } from "@/lib/use-applications-list-poll";

type ActiveInterviewRound = {
  id: string;
  roundNumber: number;
  scheduledAt: string;
  timezone: string;
  confirmedAt: string | null;
  attendeeEmail: string | null;
  attendeeName: string | null;
  notes: string | null;
  isCompleted: boolean;
};

type JobApplication = {
  id: string;
  name: string;
  email: string;
  phone: string;
  coverNote: string | null;
  resumeText: string;
  resumeUrl: string | null;
  status: ApplicationStatus;
  aiScore: number | null;
  aiSummary: string | null;
  aiRecommendation: "SHORTLIST" | "REJECT" | null;
  createdAt: string;
  jobPostingId: string;
  jobTitle: string;
  latestInterviewRound: number | null;
  totalInterviewRoundCount?: number;
  canScheduleInterview: boolean;
  interviewRounds: ActiveInterviewRound[];
};

type InterviewRoundFilter = "ALL" | "1" | "2" | "3" | "4";
type InterviewConfirmationFilter = "all" | "confirmed" | "non-confirmed";

type ScheduleMode = "create" | "reschedule";

type ScheduleFormBaseline = {
  scheduledAt: string;
  timezone: string;
  notes: string;
  attendeeEmail: string;
  attendeeName: string;
};

function scheduleFormsEqual(
  a: ScheduleFormBaseline,
  b: ScheduleFormBaseline,
): boolean {
  return (
    a.scheduledAt === b.scheduledAt &&
    a.timezone === b.timezone &&
    a.notes === b.notes &&
    a.attendeeEmail === b.attendeeEmail &&
    a.attendeeName === b.attendeeName
  );
}

function roundStatusLabel(round: ActiveInterviewRound): string {
  const base = round.confirmedAt ? "Confirmed" : "Non-confirmed";
  return round.isCompleted ? `${base} · Completed` : base;
}

function isInterviewScheduledInPast(round: ActiveInterviewRound): boolean {
  return new Date(round.scheduledAt).getTime() <= Date.now();
}

function formatInterviewerLabel(round: ActiveInterviewRound): string | null {
  const name = round.attendeeName?.trim();
  const email = round.attendeeEmail?.trim();
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return null;
}

function activeFutureInterviewRounds(app: JobApplication): ActiveInterviewRound[] {
  const now = Date.now();
  return app.interviewRounds.filter(
    (r) => new Date(r.scheduledAt).getTime() > now,
  );
}

type BulkAction = "reject" | "shortlist";

type BulkConfirmState = {
  action: BulkAction;
  count: number | null;
  loading: boolean;
};

const SCORE_BAND_LABELS: Record<Exclude<ScoreBand, "all">, string> = {
  low: "1–4",
  mid: "5–7",
  high: "8–10",
};

const BULK_STATUS_FILTER_LOOKBACK_MS = 30_000;

function bulkConfirmMessage(
  action: BulkAction,
  count: number,
  bandLabel: string,
): string {
  const verb = action === "reject" ? "reject" : "shortlist";
  const noun = count === 1 ? "application" : "applications";
  return `${verb.charAt(0).toUpperCase() + verb.slice(1)} ${count} pending ${noun} with AI scores ${bandLabel}? Candidates will be notified by email.`;
}

function isBulkTarget(
  app: JobApplication,
  scoreMin: number,
  scoreMax: number,
): boolean {
  return (
    app.status === "PENDING" &&
    app.aiScore !== null &&
    app.aiScore >= scoreMin &&
    app.aiScore <= scoreMax
  );
}

function AdminCareersApplicationsContent() {
  const searchParams = useSearchParams();
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [appsCursor, setAppsCursor] = useState<string | null>(null);
  const [appsHasMore, setAppsHasMore] = useState(false);
  const [appsLoading, setAppsLoading] = useState(true);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const appsRequestIdRef = useRef(0);
  const recentlyBulkActionedIdsRef = useRef<Set<string> | null>(null);
  const bulkActionedIdsClearTimerRef = useRef<number | null>(null);
  const recentBulkStatusUpdateRef = useRef<{
    status: "REJECTED" | "SHORTLISTED";
    at: number;
  } | null>(null);

  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "ALL">(
    "SHORTLISTED",
  );
  const [scoreBand, setScoreBand] = useState<ScoreBand>("all");
  const [shortlistedScore, setShortlistedScore] =
    useState<ShortlistedScore>("all");
  const [interviewRoundFilter, setInterviewRoundFilter] =
    useState<InterviewRoundFilter>("ALL");
  const [interviewConfirmationFilter, setInterviewConfirmationFilter] =
    useState<InterviewConfirmationFilter>("all");
  const [interviewDate, setInterviewDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [bulkStatusNotice, setBulkStatusNotice] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [scheduleTarget, setScheduleTarget] = useState<JobApplication | null>(
    null,
  );
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("create");
  const [rescheduleRound, setRescheduleRound] =
    useState<ActiveInterviewRound | null>(null);
  const [scheduleBaseline, setScheduleBaseline] =
    useState<ScheduleFormBaseline | null>(null);
  const [scheduleRound, setScheduleRound] = useState("1");
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleTimezone, setScheduleTimezone] = useState(() =>
    defaultInterviewTimezone(),
  );
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [scheduleAttendee, setScheduleAttendee] = useState("");
  const [scheduleAttendeeName, setScheduleAttendeeName] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const scheduleDatetimeRef = useRef<HTMLInputElement>(null);
  const [cancelTarget, setCancelTarget] = useState<{
    app: JobApplication;
    round: ActiveInterviewRound;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [hireTarget, setHireTarget] = useState<JobApplication | null>(null);
  const [rejectConfirmTarget, setRejectConfirmTarget] = useState<{
    app: JobApplication;
    count: number;
  } | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<BulkConfirmState | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const scoreBandActive = scoreBand !== "all";
  const interviewConfirmationActive = interviewConfirmationFilter !== "all";

  useEffect(() => {
    const fromUrl = searchParams.get("search")?.trim() ?? "";
    if (fromUrl) {
      setSearchInput(fromUrl);
      setDebouncedSearch(fromUrl);
    }

    const rawStatus = searchParams.get("status")?.trim();
    const resolvedStatus =
      rawStatus &&
      applicationStatusValues.includes(rawStatus as ApplicationStatus)
        ? (rawStatus as ApplicationStatus)
        : null;
    if (resolvedStatus) {
      setStatusFilter(resolvedStatus);
    }

    const statusForConfirmation = resolvedStatus ?? "SHORTLISTED";
    const confirmedParam = searchParams.get("interviewConfirmed")?.trim();
    if (statusForConfirmation === "SHORTLISTED") {
      if (confirmedParam === "true") {
        setInterviewConfirmationFilter("confirmed");
      } else if (confirmedParam === "false") {
        setInterviewConfirmationFilter("non-confirmed");
      } else {
        setInterviewConfirmationFilter("all");
      }
    } else {
      setInterviewConfirmationFilter("all");
    }
  }, [searchParams]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 500);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (statusFilter !== "SHORTLISTED") {
      if (interviewRoundFilter !== "ALL") setInterviewRoundFilter("ALL");
      if (interviewConfirmationFilter !== "all") {
        setInterviewConfirmationFilter("all");
      }
      if (interviewDate) setInterviewDate("");
    }
  }, [
    statusFilter,
    interviewRoundFilter,
    interviewConfirmationFilter,
    interviewDate,
  ]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    const recent = recentBulkStatusUpdateRef.current;
    if (!recent || statusFilter !== recent.status) {
      setBulkStatusNotice(false);
      return;
    }
    if (Date.now() - recent.at > BULK_STATUS_FILTER_LOOKBACK_MS) {
      setBulkStatusNotice(false);
      return;
    }
    setBulkStatusNotice(true);
  }, [statusFilter]);

  useEffect(() => {
    if (!bulkStatusNotice) return;
    const timer = window.setTimeout(() => setBulkStatusNotice(false), 5000);
    return () => window.clearTimeout(timer);
  }, [bulkStatusNotice]);

  function handleScoreBandChange(band: ScoreBand) {
    setScoreBand(band);
    if (band !== "all") {
      setStatusFilter("PENDING");
    }
  }

  function handleStatusAllClick() {
    setStatusFilter("ALL");
    setInterviewConfirmationFilter("all");
    setInterviewDate("");
  }

  function handleInterviewConfirmationFilterChange(
    value: Exclude<InterviewConfirmationFilter, "all">,
  ) {
    setInterviewConfirmationFilter((current) =>
      current === value ? "all" : value,
    );
  }

  const loadApplications = useCallback(
    async (
      cursor: string | null,
      append: boolean,
      options?: { silent?: boolean },
    ) => {
      const silent = options?.silent === true;
      const requestId = ++appsRequestIdRef.current;
      if (append) {
        setHasLoadedMore(true);
      } else if (!silent) {
        setHasLoadedMore(false);
        if (!recentlyBulkActionedIdsRef.current?.size) {
          setApplications([]);
        }
        setAppsLoading(true);
        setError(null);
      }
      try {
        const params = new URLSearchParams({ limit: "10" });
        if (cursor) params.set("cursor", cursor);
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        if (
          statusFilter === "SHORTLISTED" &&
          interviewRoundFilter !== "ALL"
        ) {
          params.set("interviewRound", interviewRoundFilter);
        }
        if (statusFilter === "SHORTLISTED" && interviewConfirmationActive) {
          params.set(
            "interviewConfirmed",
            interviewConfirmationFilter === "confirmed" ? "true" : "false",
          );
          if (interviewDate) params.set("interviewDate", interviewDate);
        }
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (statusFilter === "SHORTLISTED") {
          const score = shortlistedScoreParams(shortlistedScore);
          if (score.scoreMin) params.set("scoreMin", score.scoreMin);
          if (score.scoreMax) params.set("scoreMax", score.scoreMax);
        } else {
          const band = scoreBandParams(scoreBand);
          if (band.scoreMin) params.set("scoreMin", band.scoreMin);
          if (band.scoreMax) params.set("scoreMax", band.scoreMax);
        }
        const res = await fetch(
          `/api/admin/careers/applications?${params}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (appsRequestIdRef.current !== requestId) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to load applications");
        const next: JobApplication[] = (
          Array.isArray(data.items) ? data.items : []
        ).map((item: JobApplication) => ({
          ...item,
          interviewRounds: Array.isArray(item.interviewRounds)
            ? item.interviewRounds
            : [],
          canScheduleInterview:
            item.canScheduleInterview ??
            (item.totalInterviewRoundCount ?? 0) < MAX_INTERVIEW_ROUNDS,
        }));
        const hiddenIds = recentlyBulkActionedIdsRef.current;
        const filtered = hiddenIds?.size
          ? next.filter((item) => !hiddenIds.has(item.id))
          : next;
        setApplications((cur) => (append ? [...cur, ...filtered] : filtered));
        setAppsHasMore(Boolean(data.hasMore));
        setAppsCursor(data.nextCursor ?? null);
      } catch (err) {
        if (appsRequestIdRef.current !== requestId) return;
        if (!silent) {
          setError(
            err instanceof Error ? err.message : "Failed to load applications",
          );
        }
      } finally {
        if (appsRequestIdRef.current === requestId && !silent) {
          setAppsLoading(false);
        }
      }
    },
    [
      statusFilter,
      scoreBand,
      shortlistedScore,
      interviewRoundFilter,
      interviewConfirmationFilter,
      interviewConfirmationActive,
      interviewDate,
      debouncedSearch,
    ],
  );

  useEffect(() => {
    void loadApplications(null, false);
  }, [loadApplications]);

  const silentRefresh = useCallback(
    () => loadApplications(null, false, { silent: true }),
    [loadApplications],
  );

  useApplicationsListPoll({
    enabled: statusFilter === "SHORTLISTED",
    hasLoadedMore,
    pollBlocked: Boolean(
      scheduleTarget ||
        cancelTarget ||
        hireTarget ||
        rejectConfirmTarget ||
        bulkConfirm ||
        busyId,
    ),
    refresh: silentRefresh,
  });

  const [appsSentryRef] = useInfiniteScroll({
    loading: appsLoading,
    hasNextPage: appsHasMore,
    onLoadMore: () => {
      if (appsCursor) void loadApplications(appsCursor, true);
    },
    rootMargin: "0px 0px 300px 0px",
  });

  async function handleStatusChange(
    app: JobApplication,
    status: ApplicationStatus,
    options?: { cancelActiveInterviews?: boolean },
  ): Promise<boolean> {
    setBusyId(app.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/careers/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(options?.cancelActiveInterviews
            ? { cancelActiveInterviews: true }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update status");
      setApplications((cur) => {
        if (statusFilter !== "ALL" && status !== statusFilter) {
          return cur.filter((a) => a.id !== app.id);
        }
        return cur.map((a) => (a.id === app.id ? { ...a, status } : a));
      });
      if (options?.cancelActiveInterviews) {
        void loadApplications(null, false);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleRejectConfirm() {
    if (!rejectConfirmTarget) return;
    const { app } = rejectConfirmTarget;
    const ok = await handleStatusChange(app, "REJECTED", {
      cancelActiveInterviews: true,
    });
    if (ok) setRejectConfirmTarget(null);
  }

  function closeScheduleModal() {
    setScheduleTarget(null);
    setScheduleMode("create");
    setRescheduleRound(null);
    setScheduleBaseline(null);
    setScheduleRound("1");
    setScheduleAt("");
    setScheduleTimezone(defaultInterviewTimezone());
    setScheduleNotes("");
    setScheduleAttendee("");
    setScheduleAttendeeName("");
    setScheduleError(null);
  }

  function openScheduleCreate(app: JobApplication) {
    setScheduleTarget(app);
    setScheduleMode("create");
    setRescheduleRound(null);
    setScheduleBaseline(null);
    const nextRound =
      app.latestInterviewRound !== null ? app.latestInterviewRound + 1 : 1;
    setScheduleRound(String(Math.min(nextRound, MAX_INTERVIEW_ROUNDS)));
    setScheduleAt("");
    setScheduleTimezone(defaultInterviewTimezone());
    setScheduleNotes("");
    setScheduleAttendee("");
    setScheduleAttendeeName("");
    setScheduleError(null);
  }

  function openScheduleDatetimePicker() {
    const input = scheduleDatetimeRef.current;
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch {
        // Some browsers block showPicker outside a direct user gesture.
      }
    }
  }

  function openReschedule(app: JobApplication, round: ActiveInterviewRound) {
    const at = formatDatetimeLocalInTimezone(
      new Date(round.scheduledAt),
      round.timezone,
    );
    const notes = round.notes ?? "";
    const attendee = round.attendeeEmail ?? "";
    const attendeeName = round.attendeeName ?? "";
    const baseline: ScheduleFormBaseline = {
      scheduledAt: at,
      timezone: round.timezone,
      notes,
      attendeeEmail: attendee,
      attendeeName,
    };
    setScheduleTarget(app);
    setScheduleMode("reschedule");
    setRescheduleRound(round);
    setScheduleBaseline(baseline);
    setScheduleAt(at);
    setScheduleTimezone(round.timezone);
    setScheduleNotes(notes);
    setScheduleAttendee(attendee);
    setScheduleAttendeeName(attendeeName);
    setScheduleError(null);
  }

  const scheduleFormCurrent: ScheduleFormBaseline = {
    scheduledAt: scheduleAt,
    timezone: scheduleTimezone,
    notes: scheduleNotes,
    attendeeEmail: scheduleAttendee,
    attendeeName: scheduleAttendeeName,
  };

  const scheduleUnchanged =
    scheduleMode === "reschedule" &&
    scheduleBaseline !== null &&
    scheduleFormsEqual(scheduleFormCurrent, scheduleBaseline);

  const scheduleNotesOverLimit =
    countInterviewNotesChars(scheduleNotes) > INTERVIEW_NOTES_MAX_CHARS;

  const cancelReasonOverLimit =
    countInterviewCancellationReasonChars(cancelReason) >
    INTERVIEW_CANCELLATION_REASON_MAX_CHARS;

  async function handleScheduleInterview(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduleTarget) return;
    if (scheduleUnchanged) return;
    setBusyId(scheduleTarget.id);
    setScheduleError(null);
    try {
      const scheduledAt = parseDatetimeLocalInTimezone(
        scheduleAt,
        scheduleTimezone,
      );
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new Error("Invalid date and time");
      }
      const payload = {
        scheduledAt: scheduledAt.toISOString(),
        timezone: scheduleTimezone,
        notes: scheduleNotes.trim() || null,
        attendeeEmail: scheduleAttendee.trim() || null,
        attendeeName: scheduleAttendeeName.trim() || null,
      };

      if (scheduleMode === "reschedule" && rescheduleRound) {
        const res = await fetch(
          `/api/admin/careers/applications/${scheduleTarget.id}/interviews/${rescheduleRound.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to reschedule interview");
        }
      } else {
        const res = await fetch(
          `/api/admin/careers/applications/${scheduleTarget.id}/interviews`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              roundNumber: Number(scheduleRound),
            }),
          },
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to schedule interview");
        }
      }

      closeScheduleModal();
      void loadApplications(null, false);
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : "Failed to save interview",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkAsHired() {
    if (!hireTarget) return;
    if (!canMarkApplicationAsHired(hireTarget.interviewRounds)) return;
    const app = hireTarget;
    setBusyId(app.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/careers/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "HIRED" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to mark as hired");
      }
      setApplications((cur) =>
        cur.map((a) =>
          a.id === app.id
            ? { ...a, status: "HIRED" as ApplicationStatus, canScheduleInterview: false }
            : a,
        ),
      );
      setHireTarget(null);
      const composeUrl = buildGmailComposeUrl({
        to: app.email,
        subject: buildOfferEmailSubject(app.jobTitle),
        body: buildOfferEmailBody({
          candidateName: app.name,
          jobTitle: app.jobTitle,
        }),
      });
      window.open(composeUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark as hired");
    } finally {
      setBusyId(null);
    }
  }

  async function openBulkConfirm(action: BulkAction) {
    const band = scoreBandParams(scoreBand);
    if (!band.scoreMin || !band.scoreMax) return;

    setBulkConfirm({ action, count: null, loading: true });
    setError(null);
    setSuccessMessage(null);
    try {
      const params = new URLSearchParams({
        status: "PENDING",
        scoreMin: band.scoreMin,
        scoreMax: band.scoreMax,
      });
      const res = await fetch(
        `/api/admin/careers/applications/count?${params}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load count");
      setBulkConfirm({
        action,
        count: typeof data.count === "number" ? data.count : 0,
        loading: false,
      });
    } catch (err) {
      setBulkConfirm(null);
      setError(err instanceof Error ? err.message : "Failed to load count");
    }
  }

  async function handleBulkConfirm() {
    if (!bulkConfirm || bulkConfirm.loading) return;
    const band = scoreBandParams(scoreBand);
    if (!band.scoreMin || !band.scoreMax) return;

    const status =
      bulkConfirm.action === "reject" ? "REJECTED" : "SHORTLISTED";

    setBulkBusy(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/admin/careers/applications/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          scoreMin: Number(band.scoreMin),
          scoreMax: Number(band.scoreMax),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update applications");
      }

      setBulkConfirm(null);

      if (data.queued) {
        const verb =
          bulkConfirm.action === "reject" ? "rejecting" : "shortlisting";
        const count = typeof data.count === "number" ? data.count : 0;
        const scoreMin = Number(band.scoreMin);
        const scoreMax = Number(band.scoreMax);

        setApplications((prev) => {
          const actionedIds = prev
            .filter((app) => isBulkTarget(app, scoreMin, scoreMax))
            .map((app) => app.id);
          recentlyBulkActionedIdsRef.current = new Set(actionedIds);
          return prev.filter((app) => !isBulkTarget(app, scoreMin, scoreMax));
        });
        if (bulkActionedIdsClearTimerRef.current !== null) {
          window.clearTimeout(bulkActionedIdsClearTimerRef.current);
        }
        bulkActionedIdsClearTimerRef.current = window.setTimeout(() => {
          recentlyBulkActionedIdsRef.current = null;
          bulkActionedIdsClearTimerRef.current = null;
        }, BULK_STATUS_FILTER_LOOKBACK_MS);
        setAppsCursor(null);
        setScoreBand("all");
        recentBulkStatusUpdateRef.current = {
          status: bulkConfirm.action === "reject" ? "REJECTED" : "SHORTLISTED",
          at: Date.now(),
        };
        setSuccessMessage(
          `Started ${verb} ${count} application${count === 1 ? "" : "s"}. Emails will be sent in the background.`,
        );
      } else {
        setScoreBand("all");
        void loadApplications(null, false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update applications",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleToggleInterviewCompletion(
    app: JobApplication,
    round: ActiveInterviewRound,
    isCompleted: boolean,
  ) {
    setBusyId(app.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/careers/applications/${app.id}/interviews/${round.id}/completion`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isCompleted }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update interview");
      }
      void loadApplications(null, false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update interview",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancelInterview() {
    if (!cancelTarget) return;
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) return;
    const { app, round } = cancelTarget;
    setBusyId(app.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/careers/applications/${app.id}/interviews/${round.id}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancellationReason: trimmedReason }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to cancel interview");
      }
      setCancelTarget(null);
      setCancelReason("");
      void loadApplications(null, false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel interview",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="py-8 lg:py-10">
      <Container>
        <div>
          <h1 className="font-montaga text-2xl text-[#333333] md:text-3xl">
            Job applications
          </h1>
          <p className="mt-1 font-montserrat text-sm text-[#5e5e5e]">
            Review candidates, update status, and schedule interviews.
          </p>
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#ffd0d0] bg-[#fff6f6] p-4">
            <p className="font-montserrat text-sm text-[#b42318]">{error}</p>
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#c7d7ff] bg-[#eef3ff] p-4">
            <p className="font-montserrat text-sm text-[#2555F3]">
              {successMessage}
            </p>
          </div>
        ) : null}

        <div className="mt-6">
          <label className="sr-only" htmlFor="admin-applications-search">
            Search by candidate email
          </label>
          <div className="relative w-full max-w-md">
            <input
              id="admin-applications-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by candidate email..."
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
        </div>

        {statusFilter === "SHORTLISTED" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(
              [
                ["confirmed", "Confirmed"],
                ["non-confirmed", "Non-confirmed"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => handleInterviewConfirmationFilterChange(value)}
                className={`rounded-full border px-3 py-1 font-montserrat text-xs font-medium ${
                  interviewConfirmationFilter === value
                    ? "cursor-pointer border-[#2555F3] bg-[#eef3ff] text-[#2555F3]"
                    : "cursor-pointer border-[#e5e5e5] bg-white text-[#333333]"
                }`}
              >
                {label}
              </button>
            ))}
            {interviewConfirmationActive ? (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="interview-date-filter"
                  className="font-montserrat text-xs font-medium text-[#5e5e5e]"
                >
                  Interview date (UTC)
                </label>
                <input
                  id="interview-date-filter"
                  type="date"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                  className="cursor-pointer rounded-full border border-[#e5e5e5] bg-white px-3 py-1 font-montserrat text-xs font-medium text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20"
                />
                {interviewDate ? (
                  <button
                    type="button"
                    onClick={() => setInterviewDate("")}
                    className="cursor-pointer font-montserrat text-xs text-[#5e5e5e] hover:text-[#2555F3]"
                  >
                    Clear date
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={scoreBandActive}
            onClick={handleStatusAllClick}
            className={`rounded-full border px-3 py-1 font-montserrat text-xs font-medium ${
              scoreBandActive
                ? "cursor-not-allowed border-[#e5e5e5] bg-[#f5f5f5] text-[#9e9e9e] opacity-60"
                : statusFilter === "ALL"
                  ? "cursor-pointer border-[#2555F3] bg-[#eef3ff] text-[#2555F3]"
                  : "cursor-pointer border-[#e5e5e5] bg-white text-[#333333]"
            }`}
          >
            All
          </button>
          {applicationStatusValues.map((s) => {
            const isPending = s === "PENDING";
            const disabled = scoreBandActive && !isPending;
            return (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 font-montserrat text-xs font-medium ${
                  disabled
                    ? "cursor-not-allowed border-[#e5e5e5] bg-[#f5f5f5] text-[#9e9e9e] opacity-60"
                    : statusFilter === s
                      ? "cursor-pointer border-[#2555F3] bg-[#eef3ff] text-[#2555F3]"
                      : "cursor-pointer border-[#e5e5e5] bg-white text-[#333333]"
                }`}
              >
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            );
          })}
          {statusFilter === "SHORTLISTED" ? (
            <div className="flex items-center gap-2 sm:ml-1">
              <label
                htmlFor="interview-round-filter"
                className="font-montserrat text-xs font-medium text-[#5e5e5e]"
              >
                Round
              </label>
              <select
                id="interview-round-filter"
                value={interviewRoundFilter}
                onChange={(e) =>
                  setInterviewRoundFilter(
                    e.target.value as InterviewRoundFilter,
                  )
                }
                className={`${SELECT_CHEVRON} cursor-pointer rounded-full border border-[#e5e5e5] bg-white py-1 pl-3 pr-9 font-montserrat text-xs font-medium text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20`}
              >
                <option value="ALL">All rounds</option>
                {Array.from({ length: MAX_INTERVIEW_ROUNDS }, (_, i) => {
                  const round = i + 1;
                  return (
                    <option key={round} value={String(round)}>
                      Round {round}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}
        </div>
        {statusFilter === "SHORTLISTED" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label
                htmlFor="shortlisted-score-filter"
                className="font-montserrat text-xs font-medium text-[#5e5e5e]"
              >
                AI score
              </label>
              <select
                id="shortlisted-score-filter"
                value={shortlistedScore}
                onChange={(e) =>
                  setShortlistedScore(e.target.value as ShortlistedScore)
                }
                className={`${SELECT_CHEVRON} cursor-pointer rounded-full border border-[#e5e5e5] bg-white py-1 pl-3 pr-9 font-montserrat text-xs font-medium text-[#333333] outline-none focus:border-[#2555F3] focus:ring-2 focus:ring-[#2555F3]/20`}
              >
                <option value="all">All scores</option>
                {(["5", "6", "7", "8", "9", "10"] as const).map((score) => (
                  <option key={score} value={score}>
                    {score}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["all", "All scores"],
                  ["low", "1–4"],
                  ["mid", "5–7"],
                  ["high", "8–10"],
                ] as const
              ).map(([band, label]) => (
                <button
                  key={band}
                  type="button"
                  onClick={() => handleScoreBandChange(band)}
                  className={`cursor-pointer rounded-full border px-3 py-1 font-montserrat text-xs font-medium ${
                    scoreBand === band
                      ? "border-[#2555F3] bg-[#eef3ff] text-[#2555F3]"
                      : "border-[#e5e5e5] bg-white text-[#333333]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        {scoreBandActive && statusFilter !== "SHORTLISTED" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {(scoreBand === "low" || scoreBand === "mid") && (
              <Button
                type="button"
                disabled={bulkBusy}
                onClick={() => void openBulkConfirm("reject")}
                className="cursor-pointer rounded-full bg-[#b42318] font-montserrat text-sm hover:bg-[#912018] disabled:opacity-60"
              >
                Reject all
              </Button>
            )}
            {(scoreBand === "mid" || scoreBand === "high") && (
              <Button
                type="button"
                disabled={bulkBusy}
                onClick={() => void openBulkConfirm("shortlist")}
                className="cursor-pointer rounded-full bg-[#2555F3] font-montserrat text-sm hover:bg-[#1e44c7] disabled:opacity-60"
              >
                Shortlist all
              </Button>
            )}
          </div>
        ) : null}

        {bulkStatusNotice ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#c7d7ff] bg-[#eef3ff] p-4">
            <p className="font-montserrat text-sm text-[#2555F3]">
              Still updating — refresh in a few seconds if you don&apos;t see all
              results yet.
            </p>
          </div>
        ) : null}

        {appsLoading && applications.length === 0 ? (
          <p className="mt-6 font-montserrat text-sm text-[#5e5e5e]">Loading...</p>
        ) : applications.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
            <p className="font-montserrat text-sm text-[#5e5e5e]">
              No applications match these filters.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {applications.map((app) => (
              <article
                key={app.id}
                className="rounded-xl border border-[#e5e5e5] bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-montserrat text-base font-semibold text-[#333333]">
                      {app.name}
                    </h3>
                    <p className="mt-1 font-montserrat text-sm text-[#5e5e5e]">
                      {app.jobTitle}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={aiScoreBadgeClass(app.aiScore)}>
                      {app.aiScore !== null ? `${app.aiScore}/10` : "—"}
                    </span>
                    <span className={statusBadgeClass(app.status)}>
                      {app.status}
                    </span>
                    {app.interviewRounds.length > 0 ? (
                      <span className="inline-flex items-center rounded-full border border-[#d7e4ff] bg-[#eef3ff] px-2.5 py-1 font-montserrat text-xs font-medium text-[#2555F3]">
                        {app.interviewRounds.length === 1
                          ? `Round ${app.interviewRounds[0]!.roundNumber} · ${roundStatusLabel(app.interviewRounds[0]!)}${
                              app.interviewRounds[0]!.attendeeName?.trim()
                                ? ` · ${app.interviewRounds[0]!.attendeeName!.trim()}`
                                : ""
                            }`
                          : `${app.interviewRounds.length} active interviews`}
                      </span>
                    ) : null}
                  </div>
                </div>
                {app.aiSummary ? (
                  <p className="mt-3 line-clamp-3 font-montserrat text-sm text-[#333333]">
                    {app.aiSummary}
                  </p>
                ) : (
                  <p className="mt-3 font-montserrat text-sm text-[#5e5e5e]">
                    AI screening pending…
                  </p>
                )}
                <p className="mt-2 font-montserrat text-sm text-[#333333]">
                  {app.email} · {app.phone}
                </p>
                <p className="mt-2 line-clamp-2 font-montserrat text-xs text-[#5e5e5e]">
                  {app.resumeText}
                </p>
                {app.resumeUrl ? (
                  <a
                    href={app.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block font-montserrat text-sm text-[#2555F3] hover:underline"
                  >
                    View resume link
                  </a>
                ) : null}
                <p className="mt-2 font-montserrat text-xs text-[#5e5e5e]">
                  Applied {formatCreatedDate(app.createdAt)}
                </p>
                {app.interviewRounds.length > 0 ? (
                  <ul className="mt-4 space-y-2 border-t border-[#e5e5e5] pt-4">
                    {app.interviewRounds.map((round) => (
                      <li
                        key={round.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#fafafa] px-3 py-2"
                      >
                        <div>
                          <p className="font-montserrat text-xs font-medium text-[#333333]">
                            Round {round.roundNumber} · {roundStatusLabel(round)}
                          </p>
                          <p className="font-montserrat text-xs text-[#5e5e5e]">
                            {formatInterviewTime(
                              new Date(round.scheduledAt),
                              round.timezone,
                            )}
                          </p>
                          {formatInterviewerLabel(round) ? (
                            <p className="font-montserrat text-xs text-[#5e5e5e]">
                              Interviewer: {formatInterviewerLabel(round)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {isInterviewScheduledInPast(round) ? (
                            round.isCompleted ? (
                              <button
                                type="button"
                                disabled={busyId === app.id}
                                onClick={() =>
                                  void handleToggleInterviewCompletion(
                                    app,
                                    round,
                                    false,
                                  )
                                }
                                className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 font-montserrat text-xs font-medium text-[#5e5e5e] hover:bg-[#f5f5f5] disabled:opacity-60"
                              >
                                Undo Completion
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === app.id}
                                  onClick={() =>
                                    void handleToggleInterviewCompletion(
                                      app,
                                      round,
                                      true,
                                    )
                                  }
                                  className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 font-montserrat text-xs font-medium text-[#333333] hover:bg-[#f5f5f5] disabled:opacity-60"
                                >
                                  Mark as Completed
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === app.id}
                                  onClick={() => openReschedule(app, round)}
                                  className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 font-montserrat text-xs font-medium text-[#333333] hover:bg-[#f5f5f5] disabled:opacity-60"
                                >
                                  Reschedule
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === app.id}
                                  onClick={() => {
                                    setCancelReason("");
                                    setCancelTarget({ app, round });
                                  }}
                                  className="cursor-pointer rounded-lg border border-[#ffd0d0] bg-[#fff6f6] px-2.5 py-1 font-montserrat text-xs font-medium text-[#b42318] hover:bg-[#ffe8e8] disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </>
                            )
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busyId === app.id}
                                onClick={() => openReschedule(app, round)}
                                className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 font-montserrat text-xs font-medium text-[#333333] hover:bg-[#f5f5f5] disabled:opacity-60"
                              >
                                Reschedule
                              </button>
                              <button
                                type="button"
                                disabled={busyId === app.id}
                                onClick={() => {
                                  setCancelReason("");
                                  setCancelTarget({ app, round });
                                }}
                                className="cursor-pointer rounded-lg border border-[#ffd0d0] bg-[#fff6f6] px-2.5 py-1 font-montserrat text-xs font-medium text-[#b42318] hover:bg-[#ffe8e8] disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <select
                    value={app.status}
                    disabled={busyId === app.id || app.status === "HIRED"}
                    onChange={(e) => {
                      const newStatus = e.target.value as ApplicationStatus;
                      if (newStatus === "REJECTED") {
                        const futureRounds = activeFutureInterviewRounds(app);
                        if (futureRounds.length > 0) {
                          setRejectConfirmTarget({
                            app,
                            count: futureRounds.length,
                          });
                          return;
                        }
                      }
                      void handleStatusChange(app, newStatus);
                    }}
                    className={`${SELECT_CHEVRON} cursor-pointer rounded-lg border border-[#e5e5e5] bg-white py-1.5 pl-3 pr-9 font-montserrat text-xs text-[#333333] disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    {app.status === "HIRED" ? (
                      <option value="HIRED">HIRED</option>
                    ) : null}
                    {applicationStatusDropdownValues.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {app.status === "SHORTLISTED" && app.canScheduleInterview ? (
                    <button
                      type="button"
                      disabled={busyId === app.id}
                      onClick={() => openScheduleCreate(app)}
                      className="cursor-pointer rounded-lg border border-[#2555F3] bg-[#eef3ff] px-3 py-1.5 font-montserrat text-xs font-medium text-[#2555F3] hover:bg-[#d7e4ff] disabled:opacity-60"
                    >
                      Schedule interview
                    </button>
                  ) : null}
                  {app.status === "SHORTLISTED" ? (
                    <button
                      type="button"
                      disabled={
                        busyId === app.id ||
                        !canMarkApplicationAsHired(app.interviewRounds)
                      }
                      title={
                        !canMarkApplicationAsHired(app.interviewRounds)
                          ? HIRE_BLOCKED_INCOMPLETE_INTERVIEWS_MESSAGE
                          : undefined
                      }
                      onClick={() => setHireTarget(app)}
                      className="cursor-pointer rounded-lg border border-[#d7f2d9] bg-[#effcf0] px-3 py-1.5 font-montserrat text-xs font-medium text-[#1f7a36] hover:bg-[#d7f2d9] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Mark as Hired
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {(appsHasMore || appsLoading) && applications.length > 0 && (
              <div
                ref={appsSentryRef}
                className="py-4 text-center font-montserrat text-sm text-[#5e5e5e]"
              >
                {appsLoading ? "Loading..." : "Scroll for more"}
              </div>
            )}
          </div>
        )}
      </Container>

      {mounted && scheduleTarget
        ? createPortal(
            <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
              <div className="flex min-h-full items-center justify-center">
                <form
                  onSubmit={handleScheduleInterview}
                  className="flex w-full max-w-md max-h-[90dvh] flex-col overflow-hidden rounded-xl bg-white shadow-lg sm:max-h-[90vh]"
                >
                  <div className="shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
                    <h3 className="font-montserrat text-lg font-semibold text-[#333333]">
                      {scheduleMode === "reschedule"
                        ? "Reschedule interview"
                        : "Schedule interview"}
                    </h3>
                    <p className="mt-1 font-montserrat text-sm text-[#5e5e5e]">
                      {scheduleTarget.name} — {scheduleTarget.jobTitle}
                      {scheduleMode === "reschedule" && rescheduleRound
                        ? ` · Round ${rescheduleRound.roundNumber}`
                        : ""}
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
                    <div className="space-y-3 sm:space-y-4">
                      {scheduleMode === "create" ? (
                        <div>
                          <label className="mb-1 block font-montserrat text-sm font-medium text-[#333333]">
                            Round number
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={MAX_INTERVIEW_ROUNDS}
                            required
                            value={scheduleRound}
                            onChange={(e) => setScheduleRound(e.target.value)}
                            className="w-full rounded-xl border border-[#e5e5e5] px-3 py-2 font-montserrat text-sm"
                          />
                        </div>
                      ) : null}
                      <div>
                        <label
                          htmlFor="schedule-timezone"
                          className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
                        >
                          Timezone
                        </label>
                        <select
                          id="schedule-timezone"
                          value={scheduleTimezone}
                          onChange={(e) => setScheduleTimezone(e.target.value)}
                          className={`w-full cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 pr-10 font-montserrat text-sm text-[#333333] ${SELECT_CHEVRON}`}
                        >
                          {INTERVIEW_TIMEZONE_OPTIONS.map((tz) => (
                            <option key={tz} value={tz}>
                              {tz}
                            </option>
                          ))}
                          {!INTERVIEW_TIMEZONE_OPTIONS.includes(
                            scheduleTimezone as (typeof INTERVIEW_TIMEZONE_OPTIONS)[number],
                          ) ? (
                            <option value={scheduleTimezone}>
                              {scheduleTimezone}
                            </option>
                          ) : null}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="schedule-datetime"
                          className="mb-1 block cursor-pointer font-montserrat text-sm font-medium text-[#333333]"
                          onClick={openScheduleDatetimePicker}
                        >
                          Proposed date & time
                        </label>
                        <div
                          className="relative cursor-pointer rounded-xl border border-[#e5e5e5] bg-white focus-within:border-[#2555F3] focus-within:ring-2 focus-within:ring-[#2555F3]/20"
                          onClick={openScheduleDatetimePicker}
                          role="presentation"
                        >
                          <input
                            ref={scheduleDatetimeRef}
                            id="schedule-datetime"
                            type="datetime-local"
                            required
                            min={minDatetimeLocalForTimezone(scheduleTimezone)}
                            value={scheduleAt}
                            onChange={(e) => setScheduleAt(e.target.value)}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScheduleDatetimePicker();
                            }}
                            className="w-full cursor-pointer rounded-xl border-0 bg-transparent px-3 py-2 pr-10 font-montserrat text-sm outline-none scheme-light [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100"
                          />
                        </div>
                      </div>
                      <div className="space-y-3 sm:space-y-4">
                        <div>
                          <label className="mb-1 block font-montserrat text-sm font-medium text-[#333333]">
                            Interviewer name (optional)
                          </label>
                          <input
                            type="text"
                            value={scheduleAttendeeName}
                            onChange={(e) =>
                              setScheduleAttendeeName(e.target.value)
                            }
                            placeholder="Jane Doe"
                            maxLength={255}
                            className="w-full rounded-xl border border-[#e5e5e5] px-3 py-2 font-montserrat text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-montserrat text-sm font-medium text-[#333333]">
                            Interviewer email (optional)
                          </label>
                          <input
                            type="email"
                            value={scheduleAttendee}
                            onChange={(e) => setScheduleAttendee(e.target.value)}
                            placeholder="interviewer@company.com"
                            className="w-full rounded-xl border border-[#e5e5e5] px-3 py-2 font-montserrat text-sm"
                          />
                        </div>
                      </div>
                      <p className="font-montserrat text-xs text-[#5e5e5e]">
                        Candidate is added automatically. Connect Google Calendar
                        in Settings to generate Meet links after they confirm.
                      </p>
                      <div>
                        <label className="mb-1 block font-montserrat text-sm font-medium text-[#333333]">
                          Notes (optional)
                        </label>
                        <textarea
                          rows={2}
                          maxLength={INTERVIEW_NOTES_MAX_CHARS}
                          value={scheduleNotes}
                          onChange={(e) => setScheduleNotes(e.target.value)}
                          className="w-full rounded-xl border border-[#e5e5e5] px-3 py-2 font-montserrat text-sm"
                        />
                        <CharCountFooter
                          value={scheduleNotes}
                          maxChars={INTERVIEW_NOTES_MAX_CHARS}
                          overLimitHint=" — shorten notes to save or schedule."
                        />
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 border-t border-[#e5e5e5] px-4 py-3 sm:px-6 sm:pb-6">
                    {scheduleError ? (
                      <p className="mb-3 font-montserrat text-sm text-[#b42318]">
                        {scheduleError}
                      </p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busyId === scheduleTarget.id}
                        onClick={closeScheduleModal}
                        className="cursor-pointer rounded-full font-montserrat text-sm"
                      >
                        Close
                      </Button>
                      <Button
                        type="submit"
                        disabled={
                          busyId === scheduleTarget.id ||
                          scheduleUnchanged ||
                          scheduleNotesOverLimit
                        }
                        className="cursor-pointer rounded-full bg-[#2555F3] font-montserrat text-sm hover:bg-[#1e44c7] disabled:opacity-60"
                      >
                        {busyId === scheduleTarget.id
                          ? "Saving..."
                          : scheduleMode === "reschedule"
                            ? "Save changes"
                            : "Send invite"}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && rejectConfirmTarget
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
                <h3 className="font-montserrat text-lg font-semibold text-[#333333]">
                  Reject application?
                </h3>
                <p className="mt-2 font-montserrat text-sm text-[#5e5e5e]">
                  This candidate has {rejectConfirmTarget.count} active
                  interview{rejectConfirmTarget.count === 1 ? "" : "s"}{" "}
                  scheduled. They will be cancelled automatically.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyId === rejectConfirmTarget.app.id}
                    onClick={() => setRejectConfirmTarget(null)}
                    className="cursor-pointer rounded-full font-montserrat text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={busyId === rejectConfirmTarget.app.id}
                    onClick={() => void handleRejectConfirm()}
                    className="cursor-pointer rounded-full bg-[#b42318] font-montserrat text-sm hover:bg-[#912018]"
                  >
                    {busyId === rejectConfirmTarget.app.id
                      ? "Rejecting..."
                      : "Reject application"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && cancelTarget
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
                <h3 className="font-montserrat text-lg font-semibold text-[#333333]">
                  Cancel interview?
                </h3>
                <p className="mt-2 font-montserrat text-sm text-[#5e5e5e]">
                  Round {cancelTarget.round.roundNumber} for{" "}
                  {cancelTarget.app.name} will be cancelled.
                  {formatInterviewerLabel(cancelTarget.round) ? (
                    <>
                      {" "}
                      Interviewer: {formatInterviewerLabel(cancelTarget.round)}.
                    </>
                  ) : null}
                  {cancelTarget.round.confirmedAt
                    ? " The candidate and interviewer will be notified by email."
                    : " No emails will be sent because the interview was not confirmed."}
                </p>
                <div className="mt-4">
                  <label
                    htmlFor="cancel-reason"
                    className="mb-1 block font-montserrat text-sm font-medium text-[#333333]"
                  >
                    Reason for cancellation
                  </label>
                  <textarea
                    id="cancel-reason"
                    rows={3}
                    required
                    maxLength={INTERVIEW_CANCELLATION_REASON_MAX_CHARS}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Please provide a reason for cancelling this interview"
                    className="w-full rounded-xl border border-[#e5e5e5] px-3 py-2 font-montserrat text-sm"
                  />
                  <CharCountFooter
                    value={cancelReason}
                    maxChars={INTERVIEW_CANCELLATION_REASON_MAX_CHARS}
                    overLimitHint=" — shorten the reason to cancel."
                  />
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyId === cancelTarget.app.id}
                    onClick={() => {
                      setCancelTarget(null);
                      setCancelReason("");
                    }}
                    className="cursor-pointer rounded-full font-montserrat text-sm"
                  >
                    Keep interview
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      busyId === cancelTarget.app.id ||
                      !cancelReason.trim() ||
                      cancelReasonOverLimit
                    }
                    onClick={() => void handleCancelInterview()}
                    className="cursor-pointer rounded-full bg-[#b42318] font-montserrat text-sm hover:bg-[#912018]"
                  >
                    {busyId === cancelTarget.app.id
                      ? "Cancelling..."
                      : "Cancel interview"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && hireTarget
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
                <h3 className="font-montserrat text-lg font-semibold text-[#333333]">
                  Mark as hired?
                </h3>
                <p className="mt-2 font-montserrat text-sm text-[#5e5e5e]">
                  {hireTarget.name} will be marked as hired and Gmail will open
                  with a pre-filled offer email you can review and send.
                </p>
                {!canMarkApplicationAsHired(hireTarget.interviewRounds) ? (
                  <div className="mt-4 rounded-lg border border-[#ffe7b8] bg-[#fff8eb] px-3 py-2">
                    <p className="font-montserrat text-sm text-[#9a6700]">
                      {HIRE_BLOCKED_INCOMPLETE_INTERVIEWS_MESSAGE}
                    </p>
                  </div>
                ) : null}
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyId === hireTarget.id}
                    onClick={() => setHireTarget(null)}
                    className="cursor-pointer rounded-full font-montserrat text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      busyId === hireTarget.id ||
                      !canMarkApplicationAsHired(hireTarget.interviewRounds)
                    }
                    onClick={() => void handleMarkAsHired()}
                    className="cursor-pointer rounded-full bg-[#1f7a36] font-montserrat text-sm hover:bg-[#18632c] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyId === hireTarget.id
                      ? "Updating..."
                      : "Mark as hired & compose email"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && bulkConfirm && scoreBand !== "all"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
                <h3 className="font-montserrat text-lg font-semibold text-[#333333]">
                  {bulkConfirm.action === "reject"
                    ? "Reject all?"
                    : "Shortlist all?"}
                </h3>
                <p className="mt-2 font-montserrat text-sm text-[#5e5e5e]">
                  {bulkConfirm.loading
                    ? "Counting matching applications…"
                    : bulkConfirm.count !== null
                      ? bulkConfirmMessage(
                          bulkConfirm.action,
                          bulkConfirm.count,
                          SCORE_BAND_LABELS[scoreBand],
                        )
                      : null}
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={bulkBusy}
                    onClick={() => setBulkConfirm(null)}
                    className="cursor-pointer rounded-full font-montserrat text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      bulkBusy ||
                      bulkConfirm.loading ||
                      bulkConfirm.count === 0
                    }
                    onClick={() => void handleBulkConfirm()}
                    className={`cursor-pointer rounded-full font-montserrat text-sm disabled:opacity-60 ${
                      bulkConfirm.action === "reject"
                        ? "bg-[#b42318] hover:bg-[#912018]"
                        : "bg-[#2555F3] hover:bg-[#1e44c7]"
                    }`}
                  >
                    {bulkBusy
                      ? "Starting..."
                      : bulkConfirm.action === "reject"
                        ? "Reject all"
                        : "Shortlist all"}
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

export default function AdminCareersApplicationsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-8 lg:py-10">
          <Container>
            <p className="font-montserrat text-sm text-[#5e5e5e]">
              Loading applications…
            </p>
          </Container>
        </div>
      }
    >
      <AdminCareersApplicationsContent />
    </Suspense>
  );
}
