"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
  type TouchEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Pusher from "pusher-js";
import { ImageIcon, Loader2, MoreVertical, Send, X } from "lucide-react";
import { DeleteConversationDialog } from "@/components/chat/DeleteConversationDialog";
import { MessageDeleteMenu } from "@/components/chat/MessageDeleteMenu";
import { formatMessageTime } from "@/components/chat/format-chat-time";
import { LONG_PRESS_MS, useLongPress } from "@/components/chat/useLongPress";
import { syncGlobalUnreadBadge } from "@/components/chat/useChatInboxPusher";

const DELETED_MESSAGE_PLACEHOLDER = "This message was deleted";

const SCROLL_NEAR_BOTTOM_PX = 80;

type ChatMessage = {
  id: string;
  clientId?: string;
  body: string;
  senderUserId: string;
  senderRole: string;
  isOwn: boolean;
  createdAt: string;
  status?: "pending" | "sent" | "failed";
  messageType?: string;
  localImageUrl?: string;
  isDeletedForEveryone?: boolean;
};

function canDeleteMessage(m: ChatMessage) {
  return (
    m.isOwn &&
    m.status !== "pending" &&
    m.status !== "failed" &&
    !m.isDeletedForEveryone
  );
}

type DeleteMenuTarget = {
  messageId: string;
  createdAt: string;
  anchorX: number;
  anchorY: number;
  localImageUrl?: string;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES_PER_SEND = 10;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type ThreadMeta = {
  id: string;
  appointmentId: string;
  peerName: string;
  isReadOnly: boolean;
  isReady: boolean;
};

type ChatThreadViewProps = {
  appointmentId: string;
  backHref: string;
  backLabel?: string;
  className?: string;
};

export function ChatThreadView({
  appointmentId,
  backHref,
  backLabel = "Back to chat",
  className = "",
}: ChatThreadViewProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [thread, setThread] = useState<ThreadMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingSendCount, setPendingSendCount] = useState(0);
  const [hasNewMessagesBelow, setHasNewMessagesBelow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState<Set<string>>(() => new Set());
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [deleteMenuTarget, setDeleteMenuTarget] = useState<DeleteMenuTarget | null>(
    null,
  );
  const [showDeleteConversation, setShowDeleteConversation] = useState(false);
  const [hidingConversation, setHidingConversation] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const lightboxOpenedAtRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const scrollRestoreRef = useRef<{ height: number; top: number } | null>(null);
  const loadingMoreRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);

  const openLightbox = useCallback((src: string) => {
    lightboxOpenedAtRef.current = Date.now();
    setLightboxSrc(src);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxSrc(null);
  }, []);

  const syncUnreadBadge = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/unread-counts", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { total?: number };
      if (typeof data.total === "number") {
        syncGlobalUnreadBadge(data.total);
      }
    } catch {
      // best-effort
    }
  }, []);

  const updateNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const near =
      el.scrollTop + el.clientHeight >=
      el.scrollHeight - SCROLL_NEAR_BOTTOM_PX;
    isNearBottomRef.current = near;
    if (near) {
      setHasNewMessagesBelow(false);
    }
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setHasNewMessagesBelow(false);
  }, []);

  const loadThreadWithMessages = useCallback(async () => {
    const res = await fetch(
      `/api/chat/threads/by-appointment/${encodeURIComponent(appointmentId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error("Could not load chat");
    }
    const data = (await res.json()) as {
      thread?: ThreadMeta;
      messages?: ChatMessage[];
      hasMore?: boolean;
    };
    if (!data.thread) throw new Error("Chat not found");
    conversationIdRef.current = data.thread.id;
    setThread(data.thread);
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setHasMoreOlder(Boolean(data.hasMore));
    void syncUnreadBadge();
    return data.thread;
  }, [appointmentId, syncUnreadBadge]);

  const loadOlderMessages = useCallback(async () => {
    const convId = conversationIdRef.current;
    if (!convId || loadingMoreRef.current || !hasMoreOlder) return;

    const oldest = messages[0];
    if (!oldest) return;

    loadingMoreRef.current = true;

    const scrollEl = scrollContainerRef.current;
    if (scrollEl) {
      scrollRestoreRef.current = {
        height: scrollEl.scrollHeight,
        top: scrollEl.scrollTop,
      };
    }

    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        before: oldest.createdAt,
      });
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(convId)}/messages?${params}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;

      const data = (await res.json()) as {
        messages?: ChatMessage[];
        hasMore?: boolean;
      };
      const older = Array.isArray(data.messages) ? data.messages : [];
      setHasMoreOlder(Boolean(data.hasMore));

      if (older.length === 0) {
        setHasMoreOlder(false);
        return;
      }

      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const unique = older.filter((m) => !seen.has(m.id));
        return [...unique, ...prev];
      });
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [messages, hasMoreOlder]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    async function init() {
      setLoadingInitial(true);
      setError(null);
      setHasMoreOlder(false);
      didInitialScrollRef.current = false;
      try {
        await loadThreadWithMessages();
      } catch {
        if (!cancelled) setError("Unable to load this chat.");
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [status, loadThreadWithMessages]);

  useLayoutEffect(() => {
    const restore = scrollRestoreRef.current;
    if (!restore) return;

    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) {
      scrollRestoreRef.current = null;
      return;
    }

    scrollEl.scrollTop =
      scrollEl.scrollHeight - restore.height + restore.top;
    scrollRestoreRef.current = null;
    updateNearBottom();
  }, [messages, updateNearBottom]);

  useLayoutEffect(() => {
    if (loadingInitial || didInitialScrollRef.current) return;
    if (messages.length === 0) return;
    didInitialScrollRef.current = true;
    scrollToBottom("auto");
  }, [loadingInitial, messages.length, scrollToBottom]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel || loadingInitial) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadOlderMessages();
        }
      },
      { root, rootMargin: "80px 0px 0px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlderMessages, loadingInitial, hasMoreOlder]);

  useEffect(() => {
    const conversationId = thread?.id;
    const userId = session?.user?.id;
    if (!conversationId || !userId) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });
    const channel = pusher.subscribe(`conversation-${conversationId}`);

    const onNewMessage = (payload: {
      id: string;
      body: string;
      senderUserId: string;
      senderRole: string;
      createdAt: string;
      messageType?: string;
    }) => {
      const isOwn = payload.senderUserId === userId;
      if (isOwn) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [
          ...prev,
          {
            id: payload.id,
            body: payload.body,
            senderUserId: payload.senderUserId,
            senderRole: payload.senderRole,
            isOwn,
            createdAt: payload.createdAt,
            messageType: payload.messageType,
          },
        ];
      });

      if (isNearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom("smooth"));
      } else {
        setHasNewMessagesBelow(true);
      }

      if (document.visibilityState === "visible") {
        void fetch(
          `/api/chat/threads/${encodeURIComponent(conversationId)}/read`,
          { method: "POST" },
        ).then(() => syncUnreadBadge());
      } else {
        void syncUnreadBadge();
      }
    };

    const onMessageDeleted = (payload: {
      id: string;
      isDeletedForEveryone: boolean;
    }) => {
      if (!payload.isDeletedForEveryone) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.id
            ? { ...m, isDeletedForEveryone: true, body: "" }
            : m,
        ),
      );
    };

    channel.bind("new-message", onNewMessage);
    channel.bind("message-deleted", onMessageDeleted);

    return () => {
      channel.unbind("new-message", onNewMessage);
      channel.unbind("message-deleted", onMessageDeleted);
      pusher.unsubscribe(`conversation-${conversationId}`);
      pusher.disconnect();
    };
  }, [thread?.id, session?.user?.id, syncUnreadBadge, scrollToBottom]);

  const handleDeleteMessage = useCallback(
    async (scope: "everyone" | "me") => {
      const convId = conversationIdRef.current;
      const target = deleteMenuTarget;
      if (!convId || !target) return;

      try {
        const res = await fetch(
          `/api/chat/threads/${encodeURIComponent(convId)}/messages/${encodeURIComponent(target.messageId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope }),
          },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string };
          throw new Error(data?.error ?? "Failed to delete message");
        }

        if (scope === "me") {
          if (target.localImageUrl) URL.revokeObjectURL(target.localImageUrl);
          setMessages((prev) => prev.filter((m) => m.id !== target.messageId));
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === target.messageId
                ? { ...m, isDeletedForEveryone: true, body: "" }
                : m,
            ),
          );
        }
        setDeleteMenuTarget(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete message");
      }
    },
    [deleteMenuTarget],
  );

  const handleHideConversation = useCallback(async () => {
    const convId = conversationIdRef.current;
    if (!convId || hidingConversation) return;
    const isDoctor = session?.user?.role === "DOCTOR";
    setHidingConversation(true);
    try {
      const endpoint = isDoctor ? "archive" : "hide";
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(convId)}/${endpoint}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string };
        throw new Error(
          data?.error ??
            (isDoctor
              ? "Failed to archive conversation"
              : "Failed to delete conversation"),
        );
      }
      setShowDeleteConversation(false);
      router.push(backHref);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : session?.user?.role === "DOCTOR"
            ? "Failed to archive conversation"
            : "Failed to delete conversation",
      );
      setShowDeleteConversation(false);
    } finally {
      setHidingConversation(false);
    }
  }, [backHref, hidingConversation, router, session?.user?.role]);

  /** Clears staged composer images without revoking URLs (ownership moves to sent bubbles). */
  const clearAllSelectedImages = useCallback(() => {
    setSelectedImages([]);
    setSelectionError(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }, []);

  const removeSelectedImage = useCallback((id: string) => {
    setSelectedImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((image) => image.id !== id);
    });
    setSelectionError(null);
  }, []);

  const revokeLocalImageUrl = useCallback((url: string | undefined) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    const images = selectedImages;
    const convId = conversationIdRef.current;
    const userId = session?.user?.id;
    if ((!text && images.length === 0) || !convId || !userId || thread?.isReadOnly) return;

    setSelectionError(null);

    if (images.length === 0) {
      const clientId = crypto.randomUUID();
      const optimistic: ChatMessage = {
        id: clientId,
        clientId,
        body: text,
        senderUserId: userId,
        senderRole: "",
        isOwn: true,
        createdAt: new Date().toISOString(),
        status: "pending",
        messageType: "text",
      };

      setMessages((prev) => [...prev, optimistic]);
      setDraft("");
      setPendingSendCount((n) => n + 1);
      setError(null);
      requestAnimationFrame(() => scrollToBottom("smooth"));

      try {
        const res = await fetch(
          `/api/chat/threads/${encodeURIComponent(convId)}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: text }),
          },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string };
          throw new Error(data?.error ?? "Send failed");
        }
        const data = (await res.json()) as { message?: ChatMessage };
        if (data.message) {
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === clientId
                ? { ...data.message!, status: "sent" as const }
                : m,
            ),
          );
        }
        void syncUnreadBadge();
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
        setDraft(text);
        setError(err instanceof Error ? err.message : "Failed to send");
      } finally {
        setPendingSendCount((n) => Math.max(0, n - 1));
      }
      return;
    }

    const optimisticItems = images.map((image, index) => {
      const clientId = crypto.randomUUID();
      return {
        image,
        clientId,
        body: index === images.length - 1 ? text : "",
      };
    });

    const optimisticMessages: ChatMessage[] = optimisticItems.map((item) => ({
      id: item.clientId,
      clientId: item.clientId,
      body: item.body,
      senderUserId: userId,
      senderRole: "",
      isOwn: true,
      createdAt: new Date().toISOString(),
      status: "pending",
      messageType: "image",
      localImageUrl: item.image.previewUrl,
    }));

    setMessages((prev) => [...prev, ...optimisticMessages]);
    setDraft("");
    clearAllSelectedImages();
    setPendingSendCount((n) => n + images.length);
    setError(null);
    requestAnimationFrame(() => scrollToBottom("smooth"));

    try {
      const sendOneImage = async (params: {
        file: File;
        clientId: string;
        caption: string;
        localImageUrl: string;
      }) => {
        const uploadFormData = new FormData();
        uploadFormData.append("conversationId", convId);
        uploadFormData.append("file", params.file);
        const uploadRes = await fetch("/api/chat/upload-image", {
          method: "POST",
          body: uploadFormData,
        });
        if (!uploadRes.ok) {
          const d = (await uploadRes.json().catch(() => null)) as { error?: string };
          throw new Error(d?.error ?? "Failed to upload image");
        }
        const uploadData = (await uploadRes.json()) as { key: string };
        const imageKey = uploadData.key;

        const res = await fetch(
          `/api/chat/threads/${encodeURIComponent(convId)}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              body: params.caption,
              messageType: "image",
              imageKey,
            }),
          },
        );
        if (!res.ok) {
          const d = (await res.json().catch(() => null)) as { error?: string };
          throw new Error(d?.error ?? "Failed to send image message");
        }
        const data = (await res.json()) as { message?: ChatMessage };
        if (!data.message) {
          throw new Error("Missing message response");
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === params.clientId
              ? {
                  ...data.message!,
                  clientId: params.clientId,
                  localImageUrl: params.localImageUrl,
                  status: "sent" as const,
                }
              : m,
          ),
        );
      };

      const results = await Promise.allSettled(
        optimisticItems.map((item) =>
          sendOneImage({
            file: item.image.file,
            clientId: item.clientId,
            caption: item.body,
            localImageUrl: item.image.previewUrl,
          }),
        ),
      );

      const failedClientIds: string[] = [];
      let successCount = 0;
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          failedClientIds.push(optimisticItems[index]!.clientId);
        } else {
          successCount += 1;
        }
      });

      if (successCount > 0) {
        void syncUnreadBadge();
      }

      if (failedClientIds.length > 0) {
        const failedSet = new Set(failedClientIds);
        setMessages((prev) => {
          for (const m of prev) {
            if (m.clientId && failedSet.has(m.clientId)) {
              revokeLocalImageUrl(m.localImageUrl);
            }
          }
          return prev.filter((m) => !m.clientId || !failedSet.has(m.clientId));
        });
        if (failedClientIds.length === images.length) {
          setDraft(text);
        }
        setError(`Failed to send ${failedClientIds.length} of ${images.length} images`);
      }
    } catch (err) {
      const failedSet = new Set(optimisticItems.map((item) => item.clientId));
      setMessages((prev) => {
        for (const m of prev) {
          if (m.clientId && failedSet.has(m.clientId)) {
            revokeLocalImageUrl(m.localImageUrl);
          }
        }
        return prev.filter((m) => !m.clientId || !failedSet.has(m.clientId));
      });
      setDraft(text);
      setError(err instanceof Error ? err.message : "Failed to send images");
    } finally {
      setPendingSendCount((n) => Math.max(0, n - images.length));
    }
  }

  function handleImagesSelect(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    let invalidTypeCount = 0;
    let oversizeCount = 0;

    setSelectedImages((prev) => {
      const availableSlots = Math.max(0, MAX_IMAGES_PER_SEND - prev.length);
      const accepted: SelectedImage[] = [];
      for (const file of incoming) {
        if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
          invalidTypeCount += 1;
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          oversizeCount += 1;
          continue;
        }
        if (accepted.length < availableSlots) {
          accepted.push({
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(file),
          });
        }
      }
      return [...prev, ...accepted];
    });

    if (imageInputRef.current) imageInputRef.current.value = "";

    const messages: string[] = [];
    if (invalidTypeCount > 0) messages.push(`${invalidTypeCount} invalid type`);
    if (oversizeCount > 0) messages.push(`${oversizeCount} too large`);
    if (selectedImages.length + incoming.length > MAX_IMAGES_PER_SEND) {
      messages.push(`You can send up to ${MAX_IMAGES_PER_SEND} images at once`);
    }
    setSelectionError(
      messages.length > 0 ? `Some files skipped: ${messages.join(", ")}` : null,
    );
  }

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      for (const image of selectedImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
      for (const m of messagesRef.current) {
        if (m.localImageUrl) URL.revokeObjectURL(m.localImageUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxSrc, closeLightbox]);

  const inputDisabled = loadingInitial || !thread || thread.isReadOnly;

  if (loadingInitial && !thread) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#2555F3]" aria-hidden />
      </div>
    );
  }

  if (error && !thread) {
    return (
      <div className="rounded-xl border border-[#ffd9d9] bg-[#fff1f1] px-4 py-6 text-center font-montserrat text-sm text-[#b42318]">
        {error}
        <div className="mt-4">
          <Link
            href={backHref}
            className="touch-target -ml-2 font-medium text-[#2555F3]"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex w-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-sm ${className}`}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-[#e5e5e5] px-4 py-3">
        <Link
          href={backHref}
          className="touch-target -ml-2 font-montserrat text-sm font-medium text-[#2555F3] hover:text-[#1e44c7]"
        >
          ← {backLabel}
        </Link>
        <h1 className="flex-1 truncate font-montserrat text-sm font-semibold text-[#333333]">
          {thread?.peerName}
        </h1>
        {thread && (session?.user?.role !== "DOCTOR" || thread.isReadOnly) && (
          <button
            type="button"
            onClick={() => setShowDeleteConversation(true)}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#5E5E5E] hover:bg-[#f5f5f5]"
            aria-label={
              session?.user?.role === "DOCTOR"
                ? "Archive conversation"
                : "Delete conversation"
            }
          >
            <MoreVertical className="size-4" />
          </button>
        )}
      </div>

      {thread?.isReadOnly && (
        <div
          role="status"
          className="shrink-0 border-b border-[#e5e5e5] bg-[#f5f8ff] px-4 py-2 font-montserrat text-xs text-[#5E5E5E]"
        >
          This chat is read-only — 48 hours have passed since your appointment
          was completed.
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollContainerRef}
          onScroll={updateNearBottom}
          className="absolute inset-0 space-y-3 overflow-y-auto px-4 py-4 sm:px-6"
        >
          <div ref={topSentinelRef} className="h-px w-full shrink-0" aria-hidden />
          {(loadingMore || (hasMoreOlder && messages.length > 0)) && (
            <div className="flex justify-center py-2">
              {loadingMore ? (
                <Loader2
                  className="size-5 animate-spin text-[#2555F3]"
                  aria-label="Loading older messages"
                />
              ) : (
                <span className="font-montserrat text-xs text-[#9A9A9A]">
                  Scroll up for older messages
                </span>
              )}
            </div>
          )}
          {messages.length === 0 && thread && !loadingInitial && (
            <p className="text-center font-montserrat text-sm text-[#9A9A9A]">
              No messages yet. Say hello to start the conversation.
            </p>
          )}
          {messages.map((m) => (
            <ChatMessageBubble
              key={m.clientId ?? m.id}
              message={m}
              imageLoadFailed={imageLoadFailed}
              setImageLoadFailed={setImageLoadFailed}
              onOpenImage={openLightbox}
              onOpenDeleteMenu={(coords) => {
                if (!canDeleteMessage(m)) return;
                setDeleteMenuTarget({
                  messageId: m.id,
                  createdAt: m.createdAt,
                  anchorX: coords.clientX,
                  anchorY: coords.clientY,
                  localImageUrl: m.localImageUrl,
                });
              }}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {hasNewMessagesBelow && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              className="pointer-events-auto cursor-pointer rounded-full border border-[#e5e5e5] bg-white px-4 py-2 font-montserrat text-sm font-medium text-[#2555F3] shadow-md transition-colors hover:bg-[#f5f8ff]"
            >
              New message ↓
            </button>
          </div>
        )}
      </div>

      {(selectionError ?? error) && (
        <p className="shrink-0 px-4 pb-2 font-montserrat text-xs text-[#b42318]">
          {selectionError ?? error}
        </p>
      )}

      <form
        onSubmit={handleSend}
        className="shrink-0 border-t border-[#e5e5e5] p-2 sm:p-4"
      >
        {selectedImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedImages.map((image) => (
              <div key={image.id} className="relative inline-flex">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.previewUrl}
                  alt="Selected image preview"
                  className="h-14 w-14 rounded-lg border border-[#e5e5e5] object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeSelectedImage(image.id)}
                  disabled={inputDisabled}
                  className="absolute -right-2 -top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#5E5E5E] shadow-sm hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Remove selected image"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 sm:gap-2">
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleImagesSelect(e.target.files);
          }}
        />
        <button
          type="button"
          disabled={inputDisabled}
          onClick={() => imageInputRef.current?.click()}
          className="flex h-9 w-9 max-sm:h-10 max-sm:w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#e5e5e5] text-[#5E5E5E] transition-colors hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send image"
        >
          <ImageIcon className="size-4" />
        </button>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={thread?.isReadOnly ? "Chat is closed" : "Type a message…"}
          disabled={inputDisabled}
          className="min-w-0 flex-1 rounded-xl border border-[#e5e5e5] px-3 py-2 font-montserrat text-sm outline-none focus:border-[#2555F3] disabled:cursor-not-allowed disabled:bg-[#f5f5f5] disabled:text-[#9A9A9A] sm:px-4"
          maxLength={4000}
        />
        <button
          type="submit"
          disabled={inputDisabled || (!draft.trim() && selectedImages.length === 0)}
          className="flex h-9 w-9 max-sm:h-10 max-sm:w-10 shrink-0 items-center justify-center rounded-xl bg-[#2555F3] text-white transition-colors hover:bg-[#1e44c7] disabled:opacity-50"
          aria-label="Send message"
        >
          {pendingSendCount > 0 ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
        </div>
      </form>

      {deleteMenuTarget && (
        <MessageDeleteMenu
          anchorX={deleteMenuTarget.anchorX}
          anchorY={deleteMenuTarget.anchorY}
          messageCreatedAt={deleteMenuTarget.createdAt}
          onDeleteForEveryone={() => void handleDeleteMessage("everyone")}
          onDeleteForMe={() => void handleDeleteMessage("me")}
          onClose={() => setDeleteMenuTarget(null)}
        />
      )}

      <DeleteConversationDialog
        open={showDeleteConversation}
        mode={session?.user?.role === "DOCTOR" ? "archive" : "delete"}
        onClose={() => {
          if (!hidingConversation) setShowDeleteConversation(false);
        }}
        onConfirm={handleHideConversation}
      />

      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => {
            if (Date.now() - lightboxOpenedAtRef.current < 400) return;
            closeLightbox();
          }}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute right-4 top-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close image"
          >
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt="Shared image"
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

type ChatMessageBubbleProps = {
  message: ChatMessage;
  imageLoadFailed: Set<string>;
  setImageLoadFailed: Dispatch<SetStateAction<Set<string>>>;
  onOpenImage: (src: string) => void;
  onOpenDeleteMenu: (coords: { clientX: number; clientY: number }) => void;
};

function ChatMessageBubble({
  message: m,
  imageLoadFailed,
  setImageLoadFailed,
  onOpenImage,
  onOpenDeleteMenu,
}: ChatMessageBubbleProps) {
  const messageKey = m.clientId ?? m.id;
  const imageFailed = imageLoadFailed.has(messageKey);
  const canOpenDelete = canDeleteMessage(m);
  const imageSrc = m.localImageUrl
    ? m.localImageUrl
    : `/api/chat/image/${m.id}`;

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const touchHandledRef = useRef(false);
  const TAP_MOVE_THRESHOLD = 10;

  const handleImageTouchStart = (e: TouchEvent<HTMLImageElement>) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };

  const handleImageTouchEnd = (e: TouchEvent<HTMLImageElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    touchHandledRef.current = true;
    const duration = Date.now() - start.time;
    if (duration >= LONG_PRESS_MS) return;
    const movedX = Math.abs(t.clientX - start.x);
    const movedY = Math.abs(t.clientY - start.y);
    if (movedX <= TAP_MOVE_THRESHOLD && movedY <= TAP_MOVE_THRESHOLD) {
      onOpenImage(imageSrc);
    }
  };

  const handleImageTouchCancel = () => {
    touchStartRef.current = null;
    touchHandledRef.current = true;
  };

  const handleImageClick = () => {
    if (touchHandledRef.current) {
      touchHandledRef.current = false;
      return;
    }
    onOpenImage(imageSrc);
  };

  const longPress = useLongPress((coords) => {
    if (canOpenDelete) onOpenDeleteMenu(coords);
  });

  return (
    <div
      className={`flex ${m.isOwn ? "justify-end pr-4" : "justify-start pl-4"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 font-montserrat text-sm lg:max-w-[min(75%,42rem)] ${
          m.isOwn
            ? `bg-[#2555F3] text-white${m.status === "pending" ? " opacity-80" : ""}`
            : "border border-[#e5e5e5] bg-[#fafafa] text-[#333333]"
        } ${canOpenDelete ? "select-none" : ""}`}
        {...(canOpenDelete
          ? {
              ...longPress.pointerHandlers,
              ...longPress.touchHandlers,
              onContextMenu: (e: MouseEvent) => {
                if (!canOpenDelete) return;
                longPress.contextMenuHandler(e);
              },
            }
          : {})}
      >
        {m.isDeletedForEveryone ? (
          <p
            className={`italic ${m.isOwn ? "text-white/80" : "text-[#9A9A9A]"}`}
          >
            {DELETED_MESSAGE_PLACEHOLDER}
          </p>
        ) : m.messageType === "image" ? (
                  <>
                    {!imageFailed ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={imageSrc}
                        alt="Shared image"
                        className="max-h-[300px] w-full cursor-pointer rounded-xl object-cover"
                        onClick={handleImageClick}
                        onTouchStart={handleImageTouchStart}
                        onTouchEnd={handleImageTouchEnd}
                        onTouchCancel={handleImageTouchCancel}
                        onError={() => {
                          setImageLoadFailed((prev) => {
                            if (prev.has(messageKey)) return prev;
                            const next = new Set(prev);
                            next.add(messageKey);
                            return next;
                          });
                        }}
                        onLoad={() => {
                          setImageLoadFailed((prev) => {
                            if (!prev.has(messageKey)) return prev;
                            const next = new Set(prev);
                            next.delete(messageKey);
                            return next;
                          });
                        }}
                      />
                    ) : (
                      <p className="italic opacity-70">Image failed to load</p>
                    )}
                    {m.body.trim() && (
                      <p className="mt-2 whitespace-pre-wrap wrap-break-word">{m.body}</p>
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap wrap-break-word">{m.body}</p>
                )}
        <p
          className={`mt-1 text-[10px] ${
            m.isOwn ? "text-white/80" : "text-[#9A9A9A]"
          }`}
        >
          {formatMessageTime(m.createdAt)}
        </p>
      </div>
    </div>
  );
}
