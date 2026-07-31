import { prisma } from "@/lib/prisma";

export const notificationRepository = {
  listByUser(userId: string, limit = 20) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, readAt: null } });
  },

  create(userId: string, title: string, message: string, alertId?: string) {
    return prisma.notification.create({ data: { userId, title, message, alertId } });
  },

  markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  },
};
