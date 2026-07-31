import { prisma } from "@/lib/prisma";

export const brokerRepository = {
  listByUser(userId: string) {
    return prisma.broker.findMany({ where: { userId }, orderBy: { name: "asc" } });
  },

  findOrCreate(userId: string, name: string) {
    return prisma.broker.upsert({
      where: { userId_name: { userId, name } },
      update: {},
      create: { userId, name },
    });
  },
};
