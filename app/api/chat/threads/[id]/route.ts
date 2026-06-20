import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  assertConversationAccess,
  isChatLocked,
  markRead,
} from "@/lib/chat";
import { formatDoctorDisplayName } from "@/lib/doctor-name";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;

  if (!userId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const conversation = await assertConversationAccess(id, userId, role);

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await markRead(id, userId);

  const peerName =
    role === "DOCTOR"
      ? conversation.appointment.patientName
      : formatDoctorDisplayName(conversation.appointment.doctor.name);

  return NextResponse.json({
    thread: {
      id: conversation.id,
      appointmentId: conversation.appointmentId,
      peerName,
      isReadOnly: isChatLocked(conversation.completedAt, conversation.lockedAt),
      isReady: true,
      completedAt: conversation.completedAt.toISOString(),
      lockedAt: conversation.lockedAt?.toISOString() ?? null,
    },
  });
}
