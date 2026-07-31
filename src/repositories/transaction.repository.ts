import { prisma } from "@/lib/prisma";
import type { TransactionType } from "@prisma/client";

interface TransactionData {
  assetId: string;
  brokerId?: string | null;
  type: TransactionType;
  quantity: number;
  price: number;
  fees: number;
  date: Date;
  notes?: string | null;
}

export const transactionRepository = {
  findAllByUser(userId: string) {
    return prisma.transaction.findMany({
      where: { userId },
      include: {
        asset: { select: { id: true, ticker: true, name: true, type: true, sector: true } },
      },
      orderBy: { date: "asc" },
    });
  },

  findAllByUserForListing(userId: string) {
    return prisma.transaction.findMany({
      where: { userId },
      include: {
        asset: { select: { id: true, ticker: true, type: true } },
        broker: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    });
  },

  findAllByUserAndAsset(userId: string, assetId: string) {
    return prisma.transaction.findMany({
      where: { userId, assetId },
      orderBy: { date: "asc" },
    });
  },

  findByIdAndUser(id: string, userId: string) {
    return prisma.transaction.findFirst({ where: { id, userId } });
  },

  create(userId: string, data: TransactionData) {
    return prisma.transaction.create({ data: { userId, ...data } });
  },

  update(id: string, data: TransactionData) {
    return prisma.transaction.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.transaction.delete({ where: { id } });
  },
};
