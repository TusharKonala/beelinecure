"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { Loader2, MessageCircle, MoreVertical } from "lucide-react";
import type { ChatInboxUpdatePayload } from "@/lib/chat-realtime-types";
import { DeleteConversationDialog } from "@/components/chat/DeleteConversationDialog";
import { formatListMessageTime } from "@/components/chat/format-chat-time";
import { subscribeChatInbox } from "@/components/chat/chat-inbox-bus";
import { refreshUnreadFromServer } from "@/components/chat/useChatInboxPusher";

type ChatThread = {
  id: string;
  appointmentId: string;
  peerName: string;
  peerSubtitle: string | null;
  peerPhotoUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isReadOnly: boolean;
  isReady: boolean;
  isArchived?: boolean;
};

type ChatListClientProps = {
  basePath: "/patient/chat" | "/doctor/chat";
};

type DoctorListTab = "active" | "archived";

const PAGE_SIZE = 5;

function sortThreadsByActivity(list: ChatThread[]): ChatThread[] {
  return [...list].sort((a, b) => {
    const at = a.lastMessageAt
      ? new Date(a.lastMessageAt).getTime()
      : 0;
    const bt = b.lastMessageAt
      ? new Date(b.lastMessageAt).getTime()
      : 0;
    return bt - at;
  });
}

function threadFromInboxPayload(
  payload: ChatInboxUpdatePayload,
  existing?: ChatThread,
): ChatThread {
  return {
    id: payload.conversationId,
    appointmentId: payload.appointmentId,
    peerName: payload.peerName,
    peerSubtitle: payload.peerSubtitle,
    peerPhotoUrl: payload.peerPhotoUrl,
    lastMessagePreview: payload.lastMessagePreview,
    lastMessageAt: payload.lastMessageAt,
    unreadCount: existing?.unreadCount ?? 0,
    isReadOnly: payload.isReadOnly,
    isReady: payload.isReady,
  };
}

function applyUnreadCounts(
  list: ChatThread[],
  byConversationId: Record<string, number>,
): ChatThread[] {
  return list.map((t) => ({
    ...t,
    unreadCount: t.id.startsWith("pending-")
      ? 0
      : (byConversationId[t.id] ?? 0),
  }));
}

export function ChatListClient({ basePath }: ChatListClientProps) {
  const { data: session, status } = useSession();
  const isDoctor = session?.user?.role === "DOCTOR";
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<ChatThread[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionTarget, setActionTarget] = useState<ChatThread | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [doctorTab, setDoctorTab] = useState<DoctorListTab>("active");
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [archivedNextCursor, setArchivedNextCursor] = useState<string | null>(null);
  const [archivedHasMore, setArchivedHasMore] = useState(false);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedLoadingMore, setArchivedLoadingMore] = useState(false);

  const handleInboxUpdate = useCallback((payload: ChatInboxUpdatePayload) => {
    setThreads((prev) => {
      const idx = prev.findIndex(
        (t) => t.appointmentId === payload.appointmentId,
      );
      let next: ChatThread[];
      if (idx >= 0) {
        const existing = prev[idx]!;
        const incoming = threadFromInboxPayload(payload, existing);
        next = [...prev];
        next[idx] = {
          ...existing,
          ...incoming,
          id: existing.id.startsWith("pending-") ? incoming.id : existing.id,
        };
      } else {
        next = [threadFromInboxPayload(payload), ...prev];
      }
      return sortThreadsByActivity(next);
    });

    void refreshUnreadFromServer().then((counts) => {
      if (!counts) return;
      setThreads((prev) => applyUnreadCounts(prev, counts.byConversationId));
    });
  }, []);

  useEffect(() => {
    return subscribeChatInbox(handleInboxUpdate);
  }, [handleInboxUpdate]);

  const fetchGlobalUnread = useCallback(async () => {
    const counts = await refreshUnreadFromServer();
    if (!counts) return;
    setThreads((prev) => applyUnreadCounts(prev, counts.byConversationId));
  }, []);

  const fetchThreads = useCallback(
    async (cursor: string | null, append: boolean, archived = false) => {
      if (archived && !append) setArchivedLoading(true);

      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set("cursor", cursor);
      if (archived) params.set("archived", "true");

      try {
        const res = await fetch(`/api/chat/threads?${params}`, { cache: "no-store" });
        if (!res.ok) return null;

        const data = (await res.json()) as {
          threads?: ChatThread[];
          nextCursor?: string | null;
        };
        const list = Array.isArray(data.threads) ? data.threads : [];
        const next = data.nextCursor ?? null;

        if (archived) {
          if (append) {
            setArchivedThreads((prev) => {
              const seen = new Set(prev.map((t) => t.appointmentId));
              return sortThreadsByActivity([
                ...prev,
                ...list.filter((t) => !seen.has(t.appointmentId)),
              ]);
            });
          } else {
            setArchivedThreads(sortThreadsByActivity(list));
          }
          setArchivedNextCursor(next);
          setArchivedHasMore(Boolean(next));
          setArchivedLoaded(true);
        } else {
          if (append) {
            setThreads((prev) => {
              const seen = new Set(prev.map((t) => t.appointmentId));
              return sortThreadsByActivity([
                ...prev,
                ...list.filter((t) => !seen.has(t.appointmentId)),
              ]);
            });
          } else {
            setThreads(sortThreadsByActivity(list));
          }
          setNextCursor(next);
          setHasMore(Boolean(next));
          void fetchGlobalUnread();
        }

        return list;
      } finally {
        if (archived && !append) setArchivedLoading(false);
      }
    },
    [fetchGlobalUnread],
  );

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        await fetchThreads(null, false);
      } catch {
        // best-effort
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [status, fetchThreads]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchThreads(nextCursor, true, false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore, fetchThreads]);

  const loadMoreArchived = useCallback(async () => {
    if (!archivedHasMore || !archivedNextCursor || archivedLoadingMore) return;
    setArchivedLoadingMore(true);
    try {
      await fetchThreads(archivedNextCursor, true, true);
    } finally {
      setArchivedLoadingMore(false);
    }
  }, [archivedHasMore, archivedNextCursor, archivedLoadingMore, fetchThreads]);

  const isArchivedTab = isDoctor && doctorTab === "archived";

  const [infiniteRef] = useInfiniteScroll({
    loading: isArchivedTab ? archivedLoadingMore : loadingMore,
    hasNextPage: isArchivedTab ? archivedHasMore : hasMore,
    onLoadMore: isArchivedTab ? loadMoreArchived : loadMore,
    disabled:
      loading || (isArchivedTab ? !archivedHasMore : !hasMore),
  });

  function selectDoctorTab(tab: DoctorListTab) {
    setDoctorTab(tab);
    if (tab === "archived" && !archivedLoaded) {
      void fetchThreads(null, false, true);
    }
  }

  async function handleHideConversation() {
    if (!actionTarget || actionTarget.id.startsWith("pending-") || actionPending) {
      return;
    }
    setActionPending(true);
    try {
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(actionTarget.id)}/hide`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string };
        throw new Error(data?.error ?? "Failed to delete conversation");
      }
      setThreads((prev) => prev.filter((t) => t.id !== actionTarget.id));
      setActionTarget(null);
    } catch {
      setActionTarget(null);
    } finally {
      setActionPending(false);
    }
  }

  async function handleArchiveConversation() {
    if (!actionTarget || actionTarget.id.startsWith("pending-") || actionPending) {
      return;
    }
    setActionPending(true);
    try {
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(actionTarget.id)}/archive`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string };
        throw new Error(data?.error ?? "Failed to archive conversation");
      }
      const archived = { ...actionTarget, isArchived: true };
      setThreads((prev) => prev.filter((t) => t.id !== actionTarget.id));
      if (archivedLoaded) {
        setArchivedThreads((prev) =>
          sortThreadsByActivity([archived, ...prev.filter((t) => t.id !== archived.id)]),
        );
      }
      setActionTarget(null);
    } catch {
      setActionTarget(null);
    } finally {
      setActionPending(false);
    }
  }

  async function handleUnarchiveConversation(thread: ChatThread) {
    if (thread.id.startsWith("pending-") || actionPending) return;
    setActionPending(true);
    try {
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(thread.id)}/unarchive`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string };
        throw new Error(data?.error ?? "Failed to unarchive conversation");
      }
      const restored = { ...thread, isArchived: false };
      setArchivedThreads((prev) => prev.filter((t) => t.id !== thread.id));
      setThreads((prev) =>
        sortThreadsByActivity([restored, ...prev.filter((t) => t.id !== restored.id)]),
      );
    } catch {
      // best-effort
    } finally {
      setActionPending(false);
    }
  }

  function renderThreadRow(thread: ChatThread, archived = false) {
    const timeLabel = formatListMessageTime(thread.lastMessageAt);
    const canManage = thread.isReady && !thread.id.startsWith("pending-");
    return (
      <li
        key={thread.appointmentId}
        className={`relative ${archived ? "opacity-60" : ""}`}
      >
        <Link
          href={`${basePath}/${encodeURIComponent(thread.appointmentId)}`}
          className={`flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 pr-10 transition-colors hover:bg-[#fafcff] ${
            archived ? "text-[#9A9A9A]" : ""
          }`}
        >
          {thread.peerPhotoUrl ? (
            <Image
              src={thread.peerPhotoUrl}
              alt=""
              width={44}
              height={44}
              className="size-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f5f8ff] font-montserrat text-sm font-semibold text-[#2555F3]">
              {thread.peerName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p
                className={`truncate font-montserrat text-sm font-semibold ${
                  archived ? "text-[#9A9A9A]" : "text-[#333333]"
                }`}
              >
                {thread.peerName}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                {timeLabel && !archived && (
                  <span className="font-montserrat text-[10px] text-[#9A9A9A]">
                    {timeLabel}
                  </span>
                )}
                {!archived && thread.unreadCount > 0 && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#2555F3] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                  </span>
                )}
              </div>
            </div>
            {thread.peerSubtitle && (
              <p className="truncate font-montserrat text-xs text-[#9A9A9A]">
                {thread.peerSubtitle}
              </p>
            )}
            {thread.lastMessagePreview ? (
              <p className="mt-0.5 truncate font-montserrat text-xs text-[#5E5E5E]">
                {thread.lastMessagePreview}
              </p>
            ) : (
              <p className="mt-0.5 font-montserrat text-xs text-[#9A9A9A]">
                {thread.isReady ? "Start a conversation" : "Setting up chat…"}
              </p>
            )}
            {thread.isReadOnly && (
              <p className="mt-0.5 font-montserrat text-[10px] text-[#9A9A9A]">
                Read-only
              </p>
            )}
          </div>
        </Link>
        {canManage && !archived && (!isDoctor || thread.isReadOnly) && (
          <button
            type="button"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-[#5E5E5E] hover:bg-[#f0f0f0]"
            aria-label={isDoctor ? "Archive conversation" : "Delete conversation"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActionTarget(thread);
            }}
          >
            <MoreVertical className="size-4" />
          </button>
        )}
        {canManage && archived && (
          <div className="absolute right-2 top-3 flex flex-col items-end gap-2">
            {timeLabel && (
              <span className="font-montserrat text-[10px] text-[#9A9A9A]">
                {timeLabel}
              </span>
            )}
            <button
              type="button"
              disabled={actionPending}
              className="cursor-pointer rounded-lg border border-[#e5e5e5] px-2.5 py-1 font-montserrat text-[11px] font-medium text-[#333333] hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleUnarchiveConversation(thread);
              }}
            >
              Unarchive
            </button>
          </div>
        )}
      </li>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#2555F3]" />
      </div>
    );
  }

  if (threads.length === 0 && !isDoctor) {
    return (
      <div className="rounded-xl border border-dashed border-[#e5e5e5] bg-white px-6 py-12 text-center">
        <MessageCircle className="mx-auto size-10 text-[#9A9A9A]" strokeWidth={1.5} />
        <p className="mt-3 font-montserrat text-sm font-medium text-[#333333]">
          No chats yet
        </p>
        <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
          Chats open after you complete an appointment with a doctor.
        </p>
      </div>
    );
  }

  return (
    <>
      {isDoctor && (
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => selectDoctorTab("active")}
            className={`cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors ${
              doctorTab === "active"
                ? "bg-[#2555F3] text-white"
                : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => selectDoctorTab("archived")}
            className={`cursor-pointer rounded-xl px-4 py-2 font-montserrat text-sm font-medium transition-colors ${
              doctorTab === "archived"
                ? "bg-[#2555F3] text-white"
                : "border border-[#e5e5e5] bg-white text-[#333333] hover:bg-[#fafafa]"
            }`}
          >
            Archived
          </button>
        </div>
      )}

      {(!isDoctor || doctorTab === "active") && (
        <>
          {threads.length === 0 && isDoctor && (
            <div className="rounded-xl border border-dashed border-[#e5e5e5] bg-white px-6 py-8 text-center">
              <MessageCircle className="mx-auto size-10 text-[#9A9A9A]" strokeWidth={1.5} />
              <p className="mt-3 font-montserrat text-sm font-medium text-[#333333]">
                No active chats
              </p>
              <p className="mt-1 font-montserrat text-sm text-[#5E5E5E]">
                Patients who message you will appear here.
              </p>
            </div>
          )}

          {threads.length > 0 && (
            <ul className="space-y-2">
              {threads.map((thread) => renderThreadRow(thread))}
              {hasMore && (
                <li ref={infiniteRef} className="flex justify-center py-4">
                  {loadingMore && (
                    <Loader2 className="size-6 animate-spin text-[#2555F3]" aria-hidden />
                  )}
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {isDoctor && doctorTab === "archived" && (
        <>
          {archivedLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-6 animate-spin text-[#2555F3]" />
            </div>
          ) : archivedThreads.length === 0 ? (
            <p className="py-4 text-center font-montserrat text-sm text-[#9A9A9A]">
              No archived conversations
            </p>
          ) : (
            <ul className="space-y-2">
              {archivedThreads.map((thread) => renderThreadRow(thread, true))}
              {archivedHasMore && (
                <li ref={infiniteRef} className="flex justify-center py-4">
                  {archivedLoadingMore && (
                    <Loader2 className="size-6 animate-spin text-[#2555F3]" aria-hidden />
                  )}
                </li>
              )}
            </ul>
          )}
        </>
      )}

      <DeleteConversationDialog
        open={actionTarget !== null}
        mode={isDoctor ? "archive" : "delete"}
        onClose={() => {
          if (!actionPending) setActionTarget(null);
        }}
        onConfirm={isDoctor ? handleArchiveConversation : handleHideConversation}
      />
    </>
  );
}
