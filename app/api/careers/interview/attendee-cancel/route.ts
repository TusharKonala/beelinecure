import { NextRequest, NextResponse } from "next/server";
import {
  cancelInterviewRoundByAttendeeToken,
  getAttendeeCancelPreview,
} from "@/lib/careers-interview";

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

  const result = await cancelInterviewRoundByAttendeeToken(token);
  return NextResponse.json(result);
}
