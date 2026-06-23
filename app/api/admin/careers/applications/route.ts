import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/careers-admin";
import {
  buildJobApplicationWhereInput,
  parseApplicationsListParams,
} from "@/lib/careers-applications-query";
import {
  cursorPageResult,
  parseCursorLimit,
} from "@/lib/careers-pagination";
import { MAX_INTERVIEW_ROUNDS } from "@/lib/careers-schemas";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = request.nextUrl.searchParams;
  const { limit, cursor } = parseCursorLimit(params);
  const listParams = parseApplicationsListParams(params);
  const where = buildJobApplicationWhereInput(listParams);
  const activeRoundWhere = { cancelledAt: null };

  const rows = await prisma.jobApplication.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      coverNote: true,
      resumeText: true,
      resumeUrl: true,
      status: true,
      aiScore: true,
      aiSummary: true,
      aiRecommendation: true,
      createdAt: true,
      jobPosting: { select: { id: true, title: true } },
      _count: {
        select: {
          interviewRounds: { where: activeRoundWhere },
        },
      },
      interviewRounds: {
        where: activeRoundWhere,
        select: {
          id: true,
          roundNumber: true,
          scheduledAt: true,
          timezone: true,
          confirmedAt: true,
          attendeeEmail: true,
          attendeeName: true,
          notes: true,
        },
        orderBy: { roundNumber: "asc" },
      },
    },
  });

  const { items, hasMore, nextCursor } = cursorPageResult(rows, limit);

  return NextResponse.json({
    items: items.map((a) => {
      const activeRounds = a.interviewRounds;
      const latestInterviewRound =
        activeRounds.length > 0
          ? activeRounds[activeRounds.length - 1]!.roundNumber
          : null;
      const totalInterviewRoundCount = a._count.interviewRounds;

      return {
        id: a.id,
        name: a.name,
        email: a.email,
        phone: a.phone,
        coverNote: a.coverNote,
        resumeText: a.resumeText,
        resumeUrl: a.resumeUrl,
        status: a.status,
        aiScore: a.aiScore,
        aiSummary: a.aiSummary,
        aiRecommendation: a.aiRecommendation,
        createdAt: a.createdAt.toISOString(),
        jobPostingId: a.jobPosting.id,
        jobTitle: a.jobPosting.title,
        latestInterviewRound,
        totalInterviewRoundCount,
        canScheduleInterview:
          totalInterviewRoundCount < MAX_INTERVIEW_ROUNDS,
        interviewRounds: activeRounds.map((r) => ({
          id: r.id,
          roundNumber: r.roundNumber,
          scheduledAt: r.scheduledAt.toISOString(),
          timezone: r.timezone,
          confirmedAt: r.confirmedAt?.toISOString() ?? null,
          attendeeEmail: r.attendeeEmail,
          attendeeName: r.attendeeName,
          notes: r.notes,
        })),
      };
    }),
    hasMore,
    nextCursor,
  });
}
