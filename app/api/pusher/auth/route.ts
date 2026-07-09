import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { canSubscribeToConversation } from "@/lib/chat";
import {
  getPusherServer,
  userPrivateChannel,
} from "@/lib/pusher-server";
import { UserRole } from "@/generated/prisma/client";

const CONVERSATION_CHANNEL_PREFIX = "private-conversation-";

async function isChannelAuthorized(
  channelName: string,
  user: { id: string; role: UserRole; email?: string | null },
): Promise<boolean> {
  if (channelName === userPrivateChannel(user.id)) {
    return true;
  }

  if (channelName.startsWith(CONVERSATION_CHANNEL_PREFIX)) {
    const conversationId = channelName.slice(CONVERSATION_CHANNEL_PREFIX.length);
    if (!conversationId) return false;
    return canSubscribeToConversation(conversationId, {
      userId: user.id,
      role: user.role,
      userEmail: user.email,
    });
  }

  return false;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;

  if (!userId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id");
  const channelName = params.get("channel_name");

  if (!socketId || !channelName) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const authorized = await isChannelAuthorized(channelName, {
    id: userId,
    role,
    email: session.user.email,
  });

  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const pusher = getPusherServer();
    const auth = pusher.authorizeChannel(socketId, channelName);
    return NextResponse.json(auth);
  } catch (err) {
    console.error("[pusher/auth] authorize failed:", err);
    return NextResponse.json({ error: "Auth failed" }, { status: 500 });
  }
}
