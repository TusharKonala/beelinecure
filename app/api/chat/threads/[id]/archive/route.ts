import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { archiveConversationForDoctor } from "@/lib/chat";

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

  if (role !== UserRole.DOCTOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: conversationId } = await context.params;

  try {
    await archiveConversationForDoctor(conversationId, userId, role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Archive failed";
    if (msg.includes("not found")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("read-only")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[chat/archive] Failed:", err);
    return NextResponse.json({ error: "Failed to archive conversation" }, { status: 500 });
  }
}
