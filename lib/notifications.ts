import { NotificationType, UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { triggerNotificationCreated } from "@/lib/pusher-server";

type CreateAppointmentNotificationInput = {
  patientEmail: string;
  type: NotificationType;
  title: string;
  message: string;
  /**
   * User id who initiated the action that produced this notification.
   * Used to suppress live toasts when the recipient is also the actor.
   */
  actorUserId?: string | null;
};

type CreateDoctorNotificationInput = {
  doctorId: string;
  type: NotificationType;
  title: string;
  message: string;
  /**
   * User id who initiated the action that produced this notification.
   * Used to suppress live toasts when the recipient is also the actor.
   */
  actorUserId?: string | null;
};

type CreateNotificationForUserInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actorUserId?: string | null;
};

/**
 * Creates an in-app notification row for a user and pushes it over Pusher so
 * subscribed toasters render it instantly (no polling required).
 */
async function createNotificationForUser(input: CreateNotificationForUserInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      actorUserId: input.actorUserId ?? null,
    },
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      actorUserId: true,
      createdAt: true,
    },
  });

  await triggerNotificationCreated(input.userId, {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    actorUserId: notification.actorUserId,
    createdAt: notification.createdAt.toISOString(),
  });

  return notification;
}

/**
 * Creates an in-app appointment notification for a patient identified by email.
 * No-op when the user account does not exist.
 */
export async function createAppointmentNotificationForEmail(
  input: CreateAppointmentNotificationInput,
) {
  const user = await prisma.user.findUnique({
    where: { email: input.patientEmail },
    select: { id: true },
  });
  if (!user) return;

  await createNotificationForUser({
    userId: user.id,
    type: input.type,
    title: input.title,
    message: input.message,
    actorUserId: input.actorUserId ?? null,
  });
}

/**
 * Creates an in-app notification for a doctor identified by doctor profile id.
 * No-op when the doctor has no linked user account yet.
 */
export async function createDoctorNotificationForDoctorId(
  input: CreateDoctorNotificationInput,
) {
  const doctor = await prisma.doctor.findUnique({
    where: { id: input.doctorId },
    select: { userId: true },
  });
  if (!doctor?.userId) return;

  await createNotificationForUser({
    userId: doctor.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    actorUserId: input.actorUserId ?? null,
  });
}

type CreateAdminNotificationsInput = {
  type: NotificationType;
  title: string;
  message: string;
  actorUserId?: string | null;
};

/**
 * Creates an in-app notification for every admin user and pushes each over
 * Pusher. Loops one-by-one (admin counts are tiny) so each row gets an id to
 * emit, unlike a bulk createMany.
 */
export async function createAdminNotifications(
  input: CreateAdminNotificationsInput,
) {
  const adminUsers = await prisma.user.findMany({
    where: { role: UserRole.ADMIN },
    select: { id: true },
  });

  await Promise.all(
    adminUsers.map((admin) =>
      createNotificationForUser({
        userId: admin.id,
        type: input.type,
        title: input.title,
        message: input.message,
        actorUserId: input.actorUserId ?? null,
      }),
    ),
  );
}
