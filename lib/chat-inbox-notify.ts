import { ChatSenderRole } from "@/generated/prisma/client";
import { deriveLastMessagePreview, isChatLocked } from "@/lib/chat";
import { prisma } from "@/lib/db";
import type { ChatInboxUpdatePayload } from "@/lib/chat-realtime-types";
import { formatDoctorDisplayName } from "@/lib/doctor-name";
import { triggerChatInboxUpdate } from "@/lib/pusher-server";

export async function notifyChatInboxAfterMessage(params: {
  conversationId: string;
  appointmentId: string;
  senderUserId: string;
  senderRole: ChatSenderRole;
  messageBody: string;
  messageType?: string;
  messageCreatedAt: Date;
}) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: params.conversationId },
    select: {
      id: true,
      appointmentId: true,
      doctorUserId: true,
      patientUserId: true,
      completedAt: true,
      lockedAt: true,
      _count: { select: { messages: true } },
      appointment: {
        select: {
          email: true,
          patientName: true,
          doctor: {
            select: {
              name: true,
              specialization: true,
              profilePhotoUrl: true,
            },
          },
        },
      },
    },
  });

  if (!conversation) return;

  const lastMessageAt = params.messageCreatedAt.toISOString();
  const isReadOnly = isChatLocked(
    conversation.completedAt,
    conversation.lockedAt,
  );
  const isReady = true;
  const isFirstMessage = conversation._count.messages === 1;

  const recipientIds = new Set<string>([conversation.doctorUserId]);

  if (conversation.patientUserId) {
    recipientIds.add(conversation.patientUserId);
  } else {
    const patientUser = await prisma.user.findFirst({
      where: { email: conversation.appointment.email },
      select: { id: true },
    });
    if (patientUser) {
      recipientIds.add(patientUser.id);
    }
  }

  for (const userId of recipientIds) {
    const isDoctorRecipient = userId === conversation.doctorUserId;
    const peerName = isDoctorRecipient
      ? conversation.appointment.patientName
      : formatDoctorDisplayName(conversation.appointment.doctor.name);
    const peerSubtitle = isDoctorRecipient
      ? null
      : conversation.appointment.doctor.specialization;
    const peerPhotoUrl = isDoctorRecipient
      ? null
      : conversation.appointment.doctor.profilePhotoUrl;

    const payload: ChatInboxUpdatePayload = {
      type: isFirstMessage ? "thread" : "message",
      conversationId: params.conversationId,
      appointmentId: params.appointmentId,
      lastMessagePreview:
        deriveLastMessagePreview({
          body: params.messageBody,
          messageType: params.messageType,
          imageKey: params.messageType === "image" ? "x" : null,
        }) ?? params.messageBody,
      lastMessageAt,
      senderUserId: params.senderUserId,
      peerName,
      peerSubtitle,
      peerPhotoUrl,
      isReadOnly,
      isReady,
    };

    try {
      await triggerChatInboxUpdate(userId, payload);
    } catch (err) {
      console.error("[chat/inbox-notify] Pusher failed for", userId, err);
    }
  }
}
