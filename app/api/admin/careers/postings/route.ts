import { NextRequest, NextResponse } from "next/server";
import { JobType } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/careers-admin";
import { jobTypeValues } from "@/lib/careers-schemas";
import {
  cursorPageResult,
  parseCursorLimit,
} from "@/lib/careers-pagination";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = request.nextUrl.searchParams;
  const { limit, cursor } = parseCursorLimit(params);
  const search = params.get("search")?.trim();
  const type = params.get("type");
  const remote = params.get("remote");
  const active = params.get("active");

  const where: {
    title?: { contains: string; mode: "insensitive" };
    type?: JobType;
    isRemote?: boolean;
    isActive?: boolean;
  } = {};
  if (search) where.title = { contains: search, mode: "insensitive" };
  if (type && (jobTypeValues as readonly string[]).includes(type)) {
    where.type = type as JobType;
  }
  if (remote === "true") where.isRemote = true;
  if (remote === "false") where.isRemote = false;
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;

  const rows = await prisma.jobPosting.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      isRemote: true,
      salaryRange: true,
      salaryCurrency: true,
      isActive: true,
      createdAt: true,
      _count: { select: { applications: true } },
    },
  });

  const { items, hasMore, nextCursor } = cursorPageResult(rows, limit);

  return NextResponse.json({
    items: items.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      type: p.type,
      isRemote: p.isRemote,
      salaryRange: p.salaryRange,
      salaryCurrency: p.salaryCurrency,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      applicationCount: p._count.applications,
    })),
    hasMore,
    nextCursor,
  });
}
