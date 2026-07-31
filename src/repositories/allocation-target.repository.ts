import { prisma } from "@/lib/prisma";
import type { AllocationTargetLevel } from "@prisma/client";

export const allocationTargetRepository = {
  findAllByUser(userId: string) {
    return prisma.allocationTarget.findMany({
      where: { userId },
      include: {
        asset: { select: { id: true, ticker: true, name: true, type: true, sector: true } },
      },
      orderBy: [{ level: "asc" }, { targetPercent: "desc" }],
    });
  },

  findByIdAndUser(id: string, userId: string) {
    return prisma.allocationTarget.findFirst({ where: { id, userId } });
  },

  upsert(
    userId: string,
    level: AllocationTargetLevel,
    label: string,
    targetPercent: number,
    assetId?: string | null,
  ) {
    return prisma.allocationTarget.upsert({
      where: { userId_level_label: { userId, level, label } },
      update: { targetPercent, assetId: assetId ?? null },
      create: { userId, level, label, targetPercent, assetId: assetId ?? null },
    });
  },

  delete(id: string) {
    return prisma.allocationTarget.delete({ where: { id } });
  },
};
