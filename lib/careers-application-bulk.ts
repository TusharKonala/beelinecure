import { ApplicationStatus } from "@/generated/prisma/client";
import {
  RESEND_BATCH_MAX,
  sendApplicationStatusBatchChunk,
} from "@/lib/careers-application-status-email";
import { buildPendingScoreBandWhereInput } from "@/lib/careers-applications-query";
import { prisma } from "@/lib/db";

export type BulkApplicationTarget = {
  id: string;
  email: string;
  name: string;
  jobPosting: { title: string };
};

type BulkApplicationStatus =
  | typeof ApplicationStatus.SHORTLISTED
  | typeof ApplicationStatus.REJECTED;

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function loadBulkPendingTargets(
  scoreMin: number,
  scoreMax: number,
): Promise<BulkApplicationTarget[]> {
  const where = buildPendingScoreBandWhereInput(scoreMin, scoreMax);
  return prisma.jobApplication.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      jobPosting: { select: { title: true } },
    },
  });
}

export async function countBulkPendingTargets(
  scoreMin: number,
  scoreMax: number,
): Promise<number> {
  const where = buildPendingScoreBandWhereInput(scoreMin, scoreMax);
  return prisma.jobApplication.count({ where });
}

export async function applyBulkStatusUpdate(
  targets: BulkApplicationTarget[],
  status: BulkApplicationStatus,
): Promise<void> {
  if (targets.length === 0) return;
  await prisma.jobApplication.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { status },
  });
}

export async function sendBulkStatusEmails(
  targets: BulkApplicationTarget[],
  status: BulkApplicationStatus,
): Promise<void> {
  if (targets.length === 0) return;

  const chunks = chunkArray(targets, RESEND_BATCH_MAX);
  for (const chunk of chunks) {
    await sendApplicationStatusBatchChunk(chunk, status);
  }
}
