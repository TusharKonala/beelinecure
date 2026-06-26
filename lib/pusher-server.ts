import Pusher from "pusher";
import type {
  ChatInboxUpdatePayload,
  ChatMessageDeletedPayload,
  ChatMessagePushPayload,
} from "@/lib/chat-realtime-types";

export type {
  ChatInboxUpdatePayload,
  ChatMessageDeletedPayload,
  ChatMessagePushPayload,
};

let pusherServer: Pusher | null = null;

function getPusherServer() {
  if (pusherServer) return pusherServer;

  const appId = process.env.PUSHER_APP_ID?.trim();
  const key = process.env.PUSHER_KEY?.trim();
  const secret = process.env.PUSHER_SECRET?.trim();
  const cluster = process.env.PUSHER_CLUSTER?.trim();

  if (!appId || !key || !secret || !cluster) {
    throw new Error(
      "[pusher] PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, and PUSHER_CLUSTER are required",
    );
  }

  pusherServer = new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });

  return pusherServer;
}

export function userPrivateChannel(userId: string) {
  return `private-user-${userId}`;
}

export async function triggerNewChatMessage(
  conversationId: string,
  message: ChatMessagePushPayload,
) {
  const pusher = getPusherServer();
  await pusher.trigger(`conversation-${conversationId}`, "new-message", message);
}

export async function triggerMessageDeleted(
  conversationId: string,
  payload: ChatMessageDeletedPayload,
) {
  const pusher = getPusherServer();
  await pusher.trigger(`conversation-${conversationId}`, "message-deleted", payload);
}

export async function triggerChatInboxUpdate(
  userId: string,
  payload: ChatInboxUpdatePayload,
) {
  const pusher = getPusherServer();
  await pusher.trigger(userPrivateChannel(userId), "inbox-update", payload);
}

export function doctorSlotsChannel(doctorId: string) {
  return `doctor-slots-${doctorId}`;
}

export async function triggerSlotUpdated(
  doctorId: string,
  payload: { date: string; time: string },
) {
  try {
    const pusher = getPusherServer();
    await pusher.trigger(doctorSlotsChannel(doctorId), "slot-updated", payload);
  } catch (err) {
    console.error("[pusher] slot-updated trigger failed:", err);
  }
}

export { getPusherServer };
