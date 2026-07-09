import { randomUUID } from "crypto";
import { ChatSenderRole, UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";

const CHAT_LOCK_MS = 48 * 60 * 60 * 1000;
const DOCTOR_TO_PATIENT_EMAIL_DELAY_MS = 2 * 60 * 1000;
const PATIENT_TO_DOCTOR_EMAIL_DELAY_MS = 5 * 60 * 1000;
export const MESSAGE_DELETE_FOR_EVERYONE_MS = 15 * 60 * 1000;
export const DELETED_MESSAGE_PREVIEW = "This message was deleted";

export function chatLockAtFromCompletedAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + CHAT_LOCK_MS);
}

export function isChatLocked(completedAt: Date, lockedAt: Date | null): boolean {
  if (lockedAt) return true;
  return Date.now() >= chatLockAtFromCompletedAt(completedAt).getTime();
}

export function resolveAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000"
  );
}

export function chatThreadUrlForRole(
  role: UserRole,
  appointmentId: string,
): string {
  const base = resolveAppOrigin();
  if (role === UserRole.DOCTOR) {
    return `${base}/doctor/chat/${encodeURIComponent(appointmentId)}`;
  }
  return `${base}/patient/chat/${encodeURIComponent(appointmentId)}`;
}

async function scheduleChatLock(conversationId: string, lockAt: Date) {
  try {
    await inngest.send({
      name: "chat/lock.scheduled",
      data: { conversationId },
      ts: lockAt.getTime(),
    });
  } catch (err) {
    console.error("[chat] Failed to schedule lock:", err);
  }
}

export type EnsureChatResult =
  | { status: "created" | "exists"; conversationId: string }
  | { status: "skipped_no_doctor_user" | "pending_patient_user"; conversationId?: string };

/**
 * Idempotently creates or links a chat conversation row.
 */
export async function ensureChatConversationRecord(
  appointmentId: string,
): Promise<EnsureChatResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      patientName: true,
      email: true,
      status: true,
      doctor: {
        select: {
          name: true,
          userId: true,
        },
      },
    },
  });

  if (!appointment) {
    return { status: "skipped_no_doctor_user" };
  }

  const doctorUserId = appointment.doctor.userId;
  if (!doctorUserId) {
    console.warn(
      `[chat] Skipping conversation for appointment ${appointmentId}: doctor has no user account`,
    );
    return { status: "skipped_no_doctor_user" };
  }

  const patientUser = await prisma.user.findUnique({
    where: { email: appointment.email },
    select: { id: true },
  });

  const completedAt = new Date();
  const existing = await prisma.chatConversation.findUnique({
    where: { appointmentId },
  });

  if (existing) {
    if (patientUser && !existing.patientUserId) {
      await prisma.chatConversation.update({
        where: { id: existing.id },
        data: { patientUserId: patientUser.id },
      });
    }
    return { status: "exists", conversationId: existing.id };
  }

  if (!patientUser) {
    const row = await prisma.chatConversation.create({
      data: {
        appointmentId,
        doctorUserId,
        patientUserId: null,
        twilioConversationSid: null,
        completedAt,
      },
    });
    await scheduleChatLock(row.id, chatLockAtFromCompletedAt(completedAt));
    return { status: "pending_patient_user", conversationId: row.id };
  }

  const row = await prisma.chatConversation.create({
    data: {
      appointmentId,
      doctorUserId,
      patientUserId: patientUser.id,
      twilioConversationSid: null,
      completedAt,
    },
  });

  await scheduleChatLock(row.id, chatLockAtFromCompletedAt(completedAt));

  return { status: "created", conversationId: row.id };
}

/** Idempotently creates a chat conversation when an appointment is completed. */
export async function ensureChatConversationForAppointment(
  appointmentId: string,
): Promise<EnsureChatResult> {
  return ensureChatConversationRecord(appointmentId);
}

type UnreadCountRow = { conversationId: string; count: bigint };

export async function getUnreadCountsForUser(
  userId: string,
  userEmail?: string | null,
) {
  const email = userEmail?.trim().toLowerCase() ?? "";
  const rows = await prisma.$queryRaw<UnreadCountRow[]>`
    SELECT m."conversationId", COUNT(*)::bigint AS count
    FROM "ChatMessage" m
    INNER JOIN "ChatConversation" c ON c.id = m."conversationId"
    INNER JOIN "Appointment" a ON a.id = c."appointmentId"
    LEFT JOIN "ChatReadState" rs
      ON rs."conversationId" = m."conversationId" AND rs."userId" = ${userId}
    LEFT JOIN "ChatConversationHideState" hs
      ON hs."conversationId" = c.id AND hs."userId" = ${userId}
    WHERE (
      c."doctorUserId" = ${userId}
      OR c."patientUserId" = ${userId}
      OR (${email} <> '' AND LOWER(a.email) = ${email})
    )
      AND m."senderUserId" != ${userId}
      AND m."isDeletedForEveryone" = false
      AND NOT (${userId} = ANY(m."deletedFor"))
      AND m."createdAt" > COALESCE(rs."lastReadAt", TIMESTAMP '1970-01-01')
      AND (
        hs."hiddenAt" IS NULL
        OR m."createdAt" > hs."hiddenAt"
      )
    GROUP BY m."conversationId"
  `;

  const byConversationId: Record<string, number> = {};
  for (const row of rows) {
    byConversationId[row.conversationId] = Number(row.count);
  }

  const total = Object.values(byConversationId).reduce((a, b) => a + b, 0);
  return { total, byConversationId };
}

/** Enqueue idempotent background record creation for a completed appointment. */
export async function enqueueChatConversationEnsure(appointmentId: string) {
  await inngest.send({
    id: `chat-ensure-${appointmentId}`,
    name: "chat/conversation.ensure",
    data: { appointmentId },
  });
}

export async function markRead(conversationId: string, userId: string) {
  const now = new Date();
  await prisma.chatReadState.upsert({
    where: {
      conversationId_userId: { conversationId, userId },
    },
    create: { conversationId, userId, lastReadAt: now },
    update: { lastReadAt: now },
  });
}

function normalizeChatEmail(email: string): string {
  return email.trim().toLowerCase();
}

type ConversationAccessFields = {
  doctorUserId: string;
  patientUserId: string | null;
  appointmentEmail: string;
};

type ConversationAccessResult =
  | { allowed: true; linkPatientUserId: boolean }
  | { allowed: false };

/** Pure access check shared by assertConversationAccess and sendChatMessage. */
export function resolveConversationAccess(
  conversation: ConversationAccessFields,
  params: { userId: string; role: UserRole; userEmail?: string | null },
): ConversationAccessResult {
  const { userId, role, userEmail } = params;

  if (role === UserRole.DOCTOR) {
    if (conversation.doctorUserId === userId) {
      return { allowed: true, linkPatientUserId: false };
    }
    return { allowed: false };
  }

  if (role === UserRole.PATIENT) {
    if (conversation.patientUserId === userId) {
      return { allowed: true, linkPatientUserId: false };
    }
    const email = userEmail?.trim();
    if (
      email &&
      normalizeChatEmail(email) ===
        normalizeChatEmail(conversation.appointmentEmail)
    ) {
      return {
        allowed: true,
        linkPatientUserId: conversation.patientUserId === null,
      };
    }
    return { allowed: false };
  }

  return { allowed: false };
}

export async function linkPatientUserOnConversation(
  conversationId: string,
  userId: string,
) {
  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { patientUserId: userId },
  });
}

/** Read-only access check for Pusher subscription auth (no side effects). */
export async function canSubscribeToConversation(
  conversationId: string,
  params: { userId: string; role: UserRole; userEmail?: string | null },
): Promise<boolean> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: {
      doctorUserId: true,
      patientUserId: true,
      appointment: { select: { email: true } },
    },
  });

  if (!conversation) return false;

  let userEmail = params.userEmail;
  if (
    params.role === UserRole.PATIENT &&
    conversation.patientUserId !== params.userId &&
    userEmail === undefined
  ) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { email: true },
    });
    userEmail = user?.email ?? null;
  }

  const access = resolveConversationAccess(
    {
      doctorUserId: conversation.doctorUserId,
      patientUserId: conversation.patientUserId,
      appointmentEmail: conversation.appointment.email,
    },
    { userId: params.userId, role: params.role, userEmail },
  );

  return access.allowed;
}

export async function assertConversationAccess(
  conversationId: string,
  userId: string,
  role: UserRole,
) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      appointment: {
        select: {
          id: true,
          email: true,
          patientName: true,
          doctor: { select: { name: true, userId: true } },
        },
      },
    },
  });

  if (!conversation) return null;

  let userEmail: string | null | undefined;
  if (
    role === UserRole.PATIENT &&
    conversation.patientUserId !== userId
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    userEmail = user?.email ?? null;
  }

  const access = resolveConversationAccess(
    {
      doctorUserId: conversation.doctorUserId,
      patientUserId: conversation.patientUserId,
      appointmentEmail: conversation.appointment.email,
    },
    { userId, role, userEmail },
  );

  if (!access.allowed) return null;

  if (access.linkPatientUserId) {
    await linkPatientUserOnConversation(conversationId, userId);
  }

  return conversation;
}

export async function lockConversation(conversationId: string) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { lockedAt: true },
  });
  if (!conversation || conversation.lockedAt) return;

  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { lockedAt: new Date() },
  });
}

const conversationForMessageSelect = {
  id: true,
  appointmentId: true,
  completedAt: true,
  lockedAt: true,
  doctorUserId: true,
  patientUserId: true,
} as const;

export type PersistedChatMessage = {
  id: string;
  twilioMessageSid: string;
  senderUserId: string;
  senderRole: ChatSenderRole;
  body: string;
  messageType: string;
  imageKey: string | null;
  createdAt: Date;
};

export type ConversationForDelivery = {
  id: string;
  appointmentId: string;
  doctorUserId: string;
  patientUserId: string | null;
};

export type ChatMessageForClient = {
  id: string;
  body: string;
  senderUserId: string;
  senderRole: ChatSenderRole;
  isOwn: boolean;
  createdAt: string;
  messageType: string;
  isDeletedForEveryone?: boolean;
};

export type ChatMessagesPage = {
  messages: ChatMessageForClient[];
  hasMore: boolean;
};

export const CHAT_MESSAGE_PAGE_SIZE = 50;

const messageListSelect = {
  id: true,
  senderUserId: true,
  senderRole: true,
  body: true,
  messageType: true,
  imageKey: true,
  createdAt: true,
  isDeletedForEveryone: true,
  deletedFor: true,
} as const;

type DbMessageRow = {
  id: string;
  senderUserId: string;
  senderRole: ChatSenderRole;
  body: string;
  messageType: string;
  imageKey: string | null;
  createdAt: Date;
  isDeletedForEveryone: boolean;
  deletedFor: string[];
};

export function canDeleteForEveryone(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() <= MESSAGE_DELETE_FOR_EVERYONE_MS;
}

export function messageHiddenForUser(
  msg: { deletedFor: string[] },
  userId: string,
): boolean {
  return msg.deletedFor.includes(userId);
}

export function deriveLastMessagePreview(message?: {
  body?: string | null;
  messageType?: string | null;
  imageKey?: string | null;
  isDeletedForEveryone?: boolean;
}): string | null {
  if (!message) return null;
  if (message.isDeletedForEveryone) return DELETED_MESSAGE_PREVIEW;
  const body = message.body?.trim() ?? "";
  if (body.length > 0) return body;
  if (message.imageKey || message.messageType === "image") return "Image";
  return null;
}

function mapDbMessageToClient(m: DbMessageRow, userId: string): ChatMessageForClient {
  return {
    id: m.id,
    body: m.isDeletedForEveryone ? "" : m.body,
    senderUserId: m.senderUserId,
    senderRole: m.senderRole,
    isOwn: m.senderUserId === userId,
    createdAt: m.createdAt.toISOString(),
    messageType: m.messageType,
    isDeletedForEveryone: m.isDeletedForEveryone,
  };
}

function mapDbMessagesToClient(
  dbMessages: DbMessageRow[],
  userId: string,
): ChatMessageForClient[] {
  return [...dbMessages]
    .filter((m) => !messageHiddenForUser(m, userId))
    .reverse()
    .map((m) => mapDbMessageToClient(m, userId));
}

function messagesVisibleWhere(userId: string, hiddenAt?: Date | null) {
  return {
    NOT: { deletedFor: { has: userId } },
    ...(hiddenAt ? { createdAt: { gt: hiddenAt } } : {}),
  };
}

async function getHiddenAtCutoff(
  conversationId: string,
  userId: string,
  role: UserRole,
): Promise<Date | null> {
  if (role !== UserRole.PATIENT) return null;
  const state = await prisma.chatConversationHideState.findUnique({
    where: {
      conversationId_userId: { conversationId, userId },
    },
    select: { hiddenAt: true },
  });
  return state?.hiddenAt ?? null;
}

export async function getLastVisibleMessageForPreview(
  conversationId: string,
  userId: string,
  role: UserRole,
) {
  const hiddenAt = await getHiddenAtCutoff(conversationId, userId, role);
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId, ...messagesVisibleWhere(userId, hiddenAt) },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      body: true,
      createdAt: true,
      messageType: true,
      imageKey: true,
      isDeletedForEveryone: true,
    },
  });
  return rows[0] ?? null;
}

export async function unhideConversationForUser(
  conversationId: string,
  userId: string,
) {
  const conv = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { hiddenFor: true },
  });
  if (!conv?.hiddenFor.includes(userId)) return;
  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { hiddenFor: conv.hiddenFor.filter((id) => id !== userId) },
  });
}

export async function hideConversationForUser(
  conversationId: string,
  userId: string,
  role: UserRole,
) {
  const conversation = await assertConversationAccess(conversationId, userId, role);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  if (role === UserRole.PATIENT) {
    const messageCount = await prisma.chatMessage.count({
      where: { conversationId },
    });
    if (messageCount === 0) {
      throw new Error("Cannot delete a conversation with no messages");
    }
  }
  const row = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { hiddenFor: true },
  });
  if (!row) throw new Error("Conversation not found");

  const now = new Date();
  const hiddenFor = row.hiddenFor.includes(userId)
    ? row.hiddenFor
    : [...row.hiddenFor, userId];

  await prisma.$transaction([
    prisma.chatConversationHideState.upsert({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      create: { conversationId, userId, hiddenAt: now },
      update: { hiddenAt: now },
    }),
    prisma.chatConversation.update({
      where: { id: conversationId },
      data: { hiddenFor },
    }),
  ]);
}

export async function archiveConversationForDoctor(
  conversationId: string,
  userId: string,
  role: UserRole,
) {
  const conversation = await assertConversationAccess(conversationId, userId, role);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  if (!isChatLocked(conversation.completedAt, conversation.lockedAt)) {
    throw new Error("Conversation must be read-only before archiving");
  }
  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { isArchivedByDoctor: true },
  });
}

export async function unarchiveConversationForDoctor(
  conversationId: string,
  userId: string,
  role: UserRole,
) {
  const conversation = await assertConversationAccess(conversationId, userId, role);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { isArchivedByDoctor: false },
  });
}

export type DeleteMessageScope = "everyone" | "me";

export async function deleteChatMessage(params: {
  conversationId: string;
  messageId: string;
  userId: string;
  role: UserRole;
  scope: DeleteMessageScope;
}): Promise<{ message: ChatMessageForClient; broadcastEveryone: boolean }> {
  const message = await prisma.chatMessage.findFirst({
    where: {
      id: params.messageId,
      conversationId: params.conversationId,
    },
    select: messageListSelect,
  });

  if (!message) {
    throw new Error("Message not found");
  }

  const conversation = await assertConversationAccess(
    params.conversationId,
    params.userId,
    params.role,
  );
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  if (message.senderUserId !== params.userId) {
    throw new Error("Forbidden");
  }

  if (messageHiddenForUser(message, params.userId)) {
    throw new Error("Message not found");
  }

  if (params.scope === "everyone") {
    if (message.isDeletedForEveryone) {
      return {
        message: mapDbMessageToClient(message, params.userId),
        broadcastEveryone: false,
      };
    }
    if (!canDeleteForEveryone(message.createdAt)) {
      throw new Error("Delete for everyone is only available within 15 minutes");
    }
    const updated = await prisma.chatMessage.update({
      where: { id: params.messageId },
      data: { isDeletedForEveryone: true },
      select: messageListSelect,
    });
    return {
      message: mapDbMessageToClient(updated, params.userId),
      broadcastEveryone: true,
    };
  }

  if (message.deletedFor.includes(params.userId)) {
    throw new Error("Message already deleted");
  }

  await prisma.chatMessage.update({
    where: { id: params.messageId },
    data: { deletedFor: [...message.deletedFor, params.userId] },
  });

  return {
    message: mapDbMessageToClient(message, params.userId),
    broadcastEveryone: false,
  };
}

/** Latest N messages (desc from DB), returned oldest → newest for the UI. */
export async function fetchRecentMessagesForConversation(
  conversationId: string,
  userId: string,
  role: UserRole,
  limit = CHAT_MESSAGE_PAGE_SIZE,
): Promise<ChatMessagesPage> {
  const hiddenAt = await getHiddenAtCutoff(conversationId, userId, role);
  const dbMessages = await prisma.chatMessage.findMany({
    where: { conversationId, ...messagesVisibleWhere(userId, hiddenAt) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: messageListSelect,
  });

  const hasMore = dbMessages.length > limit;
  const page = hasMore ? dbMessages.slice(0, limit) : dbMessages;

  return {
    messages: mapDbMessagesToClient(page, userId),
    hasMore,
  };
}

/** Messages older than `before`, returned oldest → newest for prepending in the UI. */
export async function fetchOlderMessagesForConversation(
  conversationId: string,
  userId: string,
  role: UserRole,
  before: Date,
  limit = CHAT_MESSAGE_PAGE_SIZE,
): Promise<ChatMessagesPage> {
  const hiddenAt = await getHiddenAtCutoff(conversationId, userId, role);
  const dbMessages = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      createdAt: {
        lt: before,
        ...(hiddenAt ? { gt: hiddenAt } : {}),
      },
      ...messagesVisibleWhere(userId),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: messageListSelect,
  });

  const hasMore = dbMessages.length > limit;
  const page = hasMore ? dbMessages.slice(0, limit) : dbMessages;

  return {
    messages: mapDbMessagesToClient(page, userId),
    hasMore,
  };
}

/**
 * POST fast path: one conversation read + one message create before response.
 * Caller should run markRead (and optional patient link) in after().
 */
export async function sendChatMessage(params: {
  conversationId: string;
  userId: string;
  role: UserRole;
  userEmail?: string | null;
  senderRole: ChatSenderRole;
  body: string;
  messageType?: string;
  imageKey?: string;
}): Promise<{
  message: PersistedChatMessage;
  conversation: ConversationForDelivery;
  linkPatientUserId: boolean;
}> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: params.conversationId },
    select: {
      ...conversationForMessageSelect,
      appointment: { select: { email: true } },
    },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const access = resolveConversationAccess(
    {
      doctorUserId: conversation.doctorUserId,
      patientUserId: conversation.patientUserId,
      appointmentEmail: conversation.appointment.email,
    },
    {
      userId: params.userId,
      role: params.role,
      userEmail: params.userEmail,
    },
  );

  if (!access.allowed) {
    throw new Error("Conversation not found");
  }

  if (isChatLocked(conversation.completedAt, conversation.lockedAt)) {
    throw new Error("Conversation is read-only");
  }

  const localSid = `local-${randomUUID()}`;
  const message = await prisma.chatMessage.create({
    data: {
      conversationId: params.conversationId,
      twilioMessageSid: localSid,
      senderUserId: params.userId,
      senderRole: params.senderRole,
      body: params.body,
      messageType: params.messageType ?? "text",
      imageKey: params.imageKey ?? null,
    },
    select: {
      id: true,
      twilioMessageSid: true,
      senderUserId: true,
      senderRole: true,
      body: true,
      messageType: true,
      imageKey: true,
      createdAt: true,
    },
  });

  const recipientUserId =
    params.senderRole === ChatSenderRole.DOCTOR
      ? conversation.patientUserId
      : conversation.doctorUserId;

  if (recipientUserId && recipientUserId !== params.userId) {
    await unhideConversationForUser(params.conversationId, recipientUserId);
  }

  return {
    message,
    conversation: {
      id: conversation.id,
      appointmentId: conversation.appointmentId,
      doctorUserId: conversation.doctorUserId,
      patientUserId: conversation.patientUserId,
    },
    linkPatientUserId: access.linkPatientUserId,
  };
}

/** Schedules delayed unread-message email for the recipient. */
export async function scheduleChatUnreadEmail(params: {
  message: { id: string; createdAt: Date };
  conversation: { id: string; appointmentId: string };
  senderRole: ChatSenderRole;
}) {
  const { message, conversation, senderRole } = params;
  const recipientRole =
    senderRole === ChatSenderRole.DOCTOR ? UserRole.PATIENT : UserRole.DOCTOR;
  const delayMs =
    senderRole === ChatSenderRole.DOCTOR
      ? DOCTOR_TO_PATIENT_EMAIL_DELAY_MS
      : PATIENT_TO_DOCTOR_EMAIL_DELAY_MS;
  try {
    await inngest.send({
      name: "chat/unread-email.cancelled",
      data: {
        conversationId: conversation.id,
        recipientRole,
      },
    });
    await inngest.send({
      id: `unread-email-${conversation.id}-${recipientRole}-${message.id}`,
      name: "chat/unread-email.scheduled",
      data: {
        conversationId: conversation.id,
        messageId: message.id,
        recipientRole,
      },
      ts: Date.now() + delayMs,
    });
  } catch (err) {
    console.error("[chat] Failed to schedule unread email:", err);
  }
}

export { CHAT_LOCK_MS };
