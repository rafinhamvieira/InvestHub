import { prisma } from "@/lib/prisma";
import type { ScoreWeights } from "@/types/score";

export const scoreWeightRepository = {
  findByUser(userId: string) {
    return prisma.scoreWeight.findUnique({ where: { userId } });
  },

  upsert(userId: string, weights: ScoreWeights) {
    return prisma.scoreWeight.upsert({
      where: { userId },
      update: weights,
      create: { userId, ...weights },
    });
  },

  reset(userId: string) {
    return prisma.scoreWeight.deleteMany({ where: { userId } });
  },
};
