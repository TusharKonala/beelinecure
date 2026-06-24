import { NextRequest, NextResponse } from "next/server";
import {
  cancelInterviewRoundByAttendeeToken,
  getAttendeeCancelPreview,
} from "@/lib/careers-interview";
import { cancelInterviewSchema } from "@/lib/careers-schemas";

function tokenFromRequest(request: NextRequest): string {
  return request.nextUrl.searchParams.get("token")?.trim() ?? "";
}

export async function GET(request: NextRequest) {
  const token = tokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ status: "invalid_link" });
  }

  const preview = await getAttendeeCancelPreview(token);
  return NextResponse.json(preview);
}

export async function POST(request: NextRequest) {
  const token = tokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ status: "invalid_link" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid_request", error: "Cancellation reason is required" },
      { status: 400 },
    );
  }

  const parsed = cancelInterviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error: parsed.error.issues[0]?.message ?? "Invalid request",
      },
      { status: 400 },
    );
  }

  const result = await cancelInterviewRoundByAttendeeToken(
    token,
    parsed.data.cancellationReason,
  );
  return NextResponse.json(result);
}
