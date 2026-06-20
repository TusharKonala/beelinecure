import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { UserRole, type Prisma } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDoctorDisplayName } from "@/lib/doctor-name";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const search = (request.nextUrl.searchParams.get("search") ?? "").trim();
  const rawRating = request.nextUrl.searchParams.get("rating");
  const parsedRating = rawRating ? Number(rawRating) : null;
  const rating =
    parsedRating && Number.isInteger(parsedRating) && parsedRating >= 1 && parsedRating <= 5
      ? parsedRating
      : null;
  const page = Math.max(
    1,
    Number(request.nextUrl.searchParams.get("page") ?? "1") || 1,
  );
  const limit = Math.min(
    20,
    Math.max(5, Number(request.nextUrl.searchParams.get("limit") ?? "10") || 10),
  );

  const where: Prisma.ReviewWhereInput = {};
  if (rating) {
    where.rating = rating;
  }
  if (search) {
    where.doctor = {
      name: {
        contains: search,
        mode: "insensitive",
      },
    };
  }

  const skip = (page - 1) * limit;
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        patient: {
          select: {
            name: true,
            email: true,
          },
        },
        doctor: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  return NextResponse.json({
    items: reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
      doctorName: formatDoctorDisplayName(review.doctor.name),
      patientName: review.patient.name ?? review.patient.email,
    })),
    hasMore: skip + reviews.length < total,
    total,
    page,
  });
}
