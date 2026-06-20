import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { AppointmentStatus, UserRole } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import {
  deriveLastMessagePreview,
  getLastVisibleMessageForPreview,
  getUnreadCountsForUser,
  isChatLocked,
} from "@/lib/chat";
import { prisma } from "@/lib/db";
import { formatDoctorDisplayName } from "@/lib/doctor-name";

function parseLimit(raw: string | null): number {
  const n = Number(raw ?? "5");
  if (!Number.isFinite(n)) return 5;
  return Math.min(20, Math.max(1, Math.floor(n)));
}

function parseCursor(raw: string | null): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sortThreadsByActivity<
  T extends { lastMessageAt: string | null; sortFallbackAt: string },
>(threads: T[]): T[] {
  return [...threads].sort((a, b) => {
    const at = a.lastMessageAt
      ? new Date(a.lastMessageAt).getTime()
      : new Date(a.sortFallbackAt).getTime();
    const bt = b.lastMessageAt
      ? new Date(b.lastMessageAt).getTime()
      : new Date(b.sortFallbackAt).getTime();
    return bt - at;
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  const email = session?.user?.email;

  if (!userId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const cursor = parseCursor(request.nextUrl.searchParams.get("cursor"));
  const archivedOnly = request.nextUrl.searchParams.get("archived") === "true";

  const unread = await getUnreadCountsForUser(userId, email ?? null);

  if (role === UserRole.PATIENT && email) {
    const completedAppointments = await prisma.appointment.findMany({
      where: {
        email,
        status: AppointmentStatus.COMPLETED,
        NOT: {
          chatConversation: {
            is: { hiddenFor: { has: userId } },
          },
        },
        ...(cursor ? { createdAt: { lt: cursor } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        createdAt: true,
        doctor: {
          select: {
            name: true,
            specialization: true,
            profilePhotoUrl: true,
          },
        },
        chatConversation: {
          select: {
            id: true,
            completedAt: true,
            lockedAt: true,
          },
        },
      },
    });

    const hasMore = completedAppointments.length > limit;
    const page = hasMore
      ? completedAppointments.slice(0, limit)
      : completedAppointments;

    const mapped = await Promise.all(
      page.map(async (apt) => {
        const conv = apt.chatConversation;
        const convId = conv?.id ?? `pending-${apt.id}`;
        const lastMessage = conv
          ? await getLastVisibleMessageForPreview(
              conv.id,
              userId,
              UserRole.PATIENT,
            )
          : null;
        const lastMessageAt = lastMessage?.createdAt?.toISOString() ?? null;
        const lastMessagePreview = deriveLastMessagePreview(
          lastMessage ?? undefined,
        );
        return {
          id: convId,
          appointmentId: apt.id,
          peerName: formatDoctorDisplayName(apt.doctor.name),
          peerSubtitle: apt.doctor.specialization,
          peerPhotoUrl: apt.doctor.profilePhotoUrl,
          lastMessagePreview,
          lastMessageAt,
          unreadCount: conv ? (unread.byConversationId[conv.id] ?? 0) : 0,
          isReadOnly: conv
            ? isChatLocked(conv.completedAt, conv.lockedAt)
            : false,
          isReady: Boolean(conv),
          sortFallbackAt: apt.createdAt.toISOString(),
        };
      }),
    );

    const threads = sortThreadsByActivity(mapped).map(
      ({ sortFallbackAt: _s, ...t }) => t,
    );

    const nextCursor = hasMore
      ? page[page.length - 1]!.createdAt.toISOString()
      : null;

    return NextResponse.json({ threads, nextCursor });
  }

  if (role === UserRole.DOCTOR) {
    const conversations = await prisma.chatConversation.findMany({
      where: {
        doctorUserId: userId,
        NOT: { hiddenFor: { has: userId } },
        isArchivedByDoctor: archivedOnly,
        ...(cursor ? { createdAt: { lt: cursor } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        appointmentId: true,
        createdAt: true,
        completedAt: true,
        lockedAt: true,
        appointment: {
          select: {
            patientName: true,
          },
        },
        messages: {
          where: { NOT: { deletedFor: { has: userId } } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            body: true,
            createdAt: true,
            messageType: true,
            imageKey: true,
            isDeletedForEveryone: true,
          },
        },
      },
    });

    const hasMore = conversations.length > limit;
    const page = hasMore ? conversations.slice(0, limit) : conversations;

    const mapped = page.map((c) => {
      const lastMessageAt = c.messages[0]?.createdAt?.toISOString() ?? null;
      const lastMessagePreview = deriveLastMessagePreview(c.messages[0]);
      return {
        id: c.id,
        appointmentId: c.appointmentId,
        peerName: c.appointment.patientName,
        peerSubtitle: null,
        peerPhotoUrl: null,
        lastMessagePreview,
        lastMessageAt,
        unreadCount: unread.byConversationId[c.id] ?? 0,
        isReadOnly: isChatLocked(c.completedAt, c.lockedAt),
        isReady: true,
        isArchived: archivedOnly,
        sortFallbackAt: c.createdAt.toISOString(),
      };
    });

    const threads = sortThreadsByActivity(mapped).map(
      ({ sortFallbackAt: _s, ...t }) => t,
    );

    const nextCursor = hasMore
      ? page[page.length - 1]!.createdAt.toISOString()
      : null;

    return NextResponse.json({ threads, nextCursor });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
