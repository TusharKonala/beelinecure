import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hideConversationForUser } from "@/lib/chat";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;

  if (!userId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await context.params;

  try {
    await hideConversationForUser(conversationId, userId, role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Hide failed";
    if (msg.includes("not found")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("no messages")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[chat/hide] Failed:", err);
    return NextResponse.json({ error: "Failed to hide conversation" }, { status: 500 });
  }
}
