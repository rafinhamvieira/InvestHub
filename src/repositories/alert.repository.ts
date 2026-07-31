import { prisma } from "@/lib/prisma";
import type { AlertStatus, AlertType, NotificationChannel } from "@prisma/client";

export const alertRepository = {
  listByUser(userId: string) {
    return prisma.alert.findMany({
      where: { userId },
      include: { asset: { select: { id: true, ticker: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  listActive(userId?: string) {
    return prisma.alert.findMany({
      where: { status: "ACTIVE", ...(userId ? { userId } : {}) },
      include: {
        asset: { select: { id: true, ticker: true, name: true } },
        user: { select: { id: true, email: true, emailNotifications: true } },
      },
    });
  },

  findByIdAndUser(id: string, userId: string) {
    return prisma.alert.findFirst({ where: { id, userId } });
  },

  create(
    userId: string,
    assetId: string,
    type: AlertType,
    targetValue: number,
    channel: NotificationChannel,
  ) {
    return prisma.alert.create({ data: { userId, assetId, type, targetValue, channel } });
  },

  updateStatus(id: string, status: AlertStatus, triggeredAt?: Date) {
    return prisma.alert.update({
      where: { id },
      data: { status, ...(triggeredAt ? { triggeredAt } : {}) },
    });
  },

  delete(id: string) {
    return prisma.alert.delete({ where: { id } });
  },
};
