import { NotificationType, UserRole } from "@/generated/prisma/client";
import { Resend } from "resend";
import { CareersDigestEmailTemplate } from "@/components/careers-digest-email-template";
import { prisma } from "@/lib/db";
import { getEmailFrom } from "@/lib/email-from";

export type CareersDigestResult =
  | { skipped: true }
  | { skipped: false; totalCount: number; applicationIds: string[] };

export function buildCareersDigestSummary(
  applications: Array<{ jobPosting: { title: string } }>,
) {
  const byTitle = new Map<string, number>();
  for (const app of applications) {
    const title = app.jobPosting.title;
    byTitle.set(title, (byTitle.get(title) ?? 0) + 1);
  }
  const lines = [...byTitle.entries()].map(
    ([title, count]) => `${title} — ${count} new`,
  );
  return {
    totalCount: applications.length,
    lines,
    message:
      applications.length === 1
        ? `1 new application received: ${lines[0] ?? ""}.`
        : `${applications.length} new applications received: ${lines.join("; ")}.`,
  };
}

export async function fetchUndigestedApplications() {
  return prisma.jobApplication.findMany({
    where: { includedInDigest: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      jobPosting: { select: { title: true } },
    },
  });
}

export async function runCareersApplicationDigest(origin: string) {
  const applications = await fetchUndigestedApplications();
  if (applications.length === 0) {
    return { skipped: true } satisfies CareersDigestResult;
  }

  const { totalCount, lines, message } = buildCareersDigestSummary(applications);
  const applicationIds = applications.map((a) => a.id);
  const careersUrl = `${origin.replace(/\/$/, "")}/admin/applications`;

  const adminUsers = await prisma.user.findMany({
    where: { role: UserRole.ADMIN },
    select: { id: true, email: true },
  });

  if (adminUsers.length > 0) {
    try {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          type: NotificationType.CAREERS_NEW_APPLICATIONS,
          title: "New job applications",
          message,
        })),
      });
    } catch (err) {
      console.error("[careers-digest] Failed to create admin notifications:", err);
    }
  }

  const adminEmails = adminUsers
    .map((a) => a.email?.trim())
    .filter((e): e is string => Boolean(e));

  if (adminEmails.length > 0 && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const adminFrom = getEmailFrom();
      await resend.emails.send({
        from: adminFrom,
        to: adminEmails,
        subject: `BeelineCure: ${totalCount} new job application${totalCount === 1 ? "" : "s"}`,
        react: CareersDigestEmailTemplate({
          totalCount,
          breakdownLines: lines,
          careersUrl,
        }),
      });
    } catch (err) {
      console.error("[careers-digest] Admin digest email failed:", err);
    }
  }

  await prisma.jobApplication.updateMany({
    where: { id: { in: applicationIds } },
    data: { includedInDigest: true },
  });

  return {
    skipped: false,
    totalCount,
    applicationIds,
  } satisfies CareersDigestResult;
}

export function resolveAppOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}
