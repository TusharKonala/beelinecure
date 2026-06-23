import { getServerSession } from "next-auth/next";
import { UserRole } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: "Unauthorized" as const, status: 401 as const };
  }
  if (session.user.role !== UserRole.ADMIN) {
    return { error: "Forbidden" as const, status: 403 as const };
  }
  return { session };
}

export async function getAdminEmails(): Promise<string[]> {
  const adminUsers = await prisma.user.findMany({
    where: { role: UserRole.ADMIN },
    select: { email: true },
  });
  return adminUsers
    .map((a) => a.email?.trim())
    .filter((e): e is string => Boolean(e));
}
