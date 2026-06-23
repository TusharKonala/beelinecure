import {
  ApplicationStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { utcDayRangeFromDateParam } from "@/lib/careers-interview-time";
import { MAX_INTERVIEW_ROUNDS } from "@/lib/careers-schemas";

const statusValues = new Set<string>(Object.values(ApplicationStatus));

export type ApplicationsListParams = {
  status: ApplicationStatus | null;
  scoreMin: number | null;
  scoreMax: number | null;
  interviewRound: number | null;
  search: string | null;
  interviewConfirmed: boolean | null;
  interviewDate: string | null;
};

export function parseApplicationsListParams(
  searchParams: URLSearchParams,
): ApplicationsListParams {
  const rawStatus = searchParams.get("status")?.trim();
  const status =
    rawStatus && statusValues.has(rawStatus)
      ? (rawStatus as ApplicationStatus)
      : null;

  const scoreMinRaw = searchParams.get("scoreMin");
  const scoreMaxRaw = searchParams.get("scoreMax");
  const scoreMin =
    scoreMinRaw !== null && scoreMinRaw !== ""
      ? Number(scoreMinRaw)
      : null;
  const scoreMax =
    scoreMaxRaw !== null && scoreMaxRaw !== ""
      ? Number(scoreMaxRaw)
      : null;

  const interviewRoundRaw = searchParams.get("interviewRound")?.trim();
  const interviewRound =
    interviewRoundRaw !== undefined &&
    interviewRoundRaw !== "" &&
    interviewRoundRaw !== "ALL"
      ? Number(interviewRoundRaw)
      : null;

  const searchRaw = searchParams.get("search")?.trim();
  const search = searchRaw ? searchRaw : null;

  const interviewConfirmedRaw = searchParams.get("interviewConfirmed")?.trim();
  const interviewConfirmed =
    interviewConfirmedRaw === "true"
      ? true
      : interviewConfirmedRaw === "false"
        ? false
        : null;

  const interviewDateRaw = searchParams.get("interviewDate")?.trim();
  const interviewDate = interviewDateRaw ? interviewDateRaw : null;

  return {
    status,
    scoreMin,
    scoreMax,
    interviewRound,
    search,
    interviewConfirmed,
    interviewDate,
  };
}

function buildLatestActiveRoundWhereInput(
  roundNumber: number,
  extra: Prisma.InterviewRoundWhereInput,
): Prisma.JobApplicationWhereInput {
  const activeRoundWhere = { cancelledAt: null };
  return {
    AND: [
      {
        interviewRounds: {
          some: { roundNumber, ...activeRoundWhere, ...extra },
        },
      },
      {
        NOT: {
          interviewRounds: {
            some: { roundNumber: { gt: roundNumber }, ...activeRoundWhere },
          },
        },
      },
    ],
  };
}

export function buildJobApplicationWhereInput(
  params: ApplicationsListParams,
): Prisma.JobApplicationWhereInput {
  const {
    status,
    scoreMin,
    scoreMax,
    interviewRound,
    search,
    interviewConfirmed,
    interviewDate,
  } = params;
  const activeRoundWhere = { cancelledAt: null };

  const where: Prisma.JobApplicationWhereInput = {};
  const andClauses: Prisma.JobApplicationWhereInput[] = [];

  if (status) where.status = status;
  if (search) {
    where.email = { contains: search, mode: "insensitive" };
  }
  if (scoreMin !== null && Number.isFinite(scoreMin)) {
    where.aiScore = { ...(where.aiScore as Prisma.IntFilter), gte: scoreMin };
  }
  if (scoreMax !== null && Number.isFinite(scoreMax)) {
    where.aiScore = { ...(where.aiScore as Prisma.IntFilter), lte: scoreMax };
  }
  if (
    (scoreMin !== null && Number.isFinite(scoreMin)) ||
    (scoreMax !== null && Number.isFinite(scoreMax))
  ) {
    where.aiScore = {
      ...(typeof where.aiScore === "object" ? where.aiScore : {}),
      not: null,
    };
  }

  if (
    interviewRound !== null &&
    Number.isInteger(interviewRound) &&
    interviewRound >= 1
  ) {
    andClauses.push(
      buildLatestActiveRoundWhereInput(interviewRound, activeRoundWhere),
    );
  }

  if (interviewConfirmed !== null) {
    const dateRange = interviewDate
      ? utcDayRangeFromDateParam(interviewDate)
      : null;
    const roundExtra: Prisma.InterviewRoundWhereInput = {
      confirmedAt: interviewConfirmed ? { not: null } : null,
      ...(dateRange
        ? { scheduledAt: { gte: dateRange.gte, lt: dateRange.lt } }
        : {}),
    };

    const latestRoundClauses: Prisma.JobApplicationWhereInput[] = [];
    for (let round = MAX_INTERVIEW_ROUNDS; round >= 1; round -= 1) {
      latestRoundClauses.push(
        buildLatestActiveRoundWhereInput(round, roundExtra),
      );
    }
    andClauses.push({ OR: latestRoundClauses });
  }

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  return where;
}

export const SCORE_BAND_RANGES = [
  { scoreMin: 1, scoreMax: 4 },
  { scoreMin: 5, scoreMax: 7 },
  { scoreMin: 8, scoreMax: 10 },
] as const;

export function isValidScoreBandRange(
  scoreMin: number,
  scoreMax: number,
): boolean {
  return SCORE_BAND_RANGES.some(
    (band) => band.scoreMin === scoreMin && band.scoreMax === scoreMax,
  );
}

export function buildPendingScoreBandWhereInput(
  scoreMin: number,
  scoreMax: number,
): Prisma.JobApplicationWhereInput {
  return buildJobApplicationWhereInput({
    status: ApplicationStatus.PENDING,
    scoreMin,
    scoreMax,
    interviewRound: null,
    search: null,
    interviewConfirmed: null,
    interviewDate: null,
  });
}
