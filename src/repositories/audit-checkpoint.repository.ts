import { prisma } from "@/lib/prisma";

/**
 * Âncoras da cadeia de auditoria.
 *
 * Como a trilha, só recebem inserção: um checkpoint alterado deixaria de provar o que
 * existe para provar. Não há método de atualização nem de remoção.
 */
export const auditCheckpointRepository = {
  create(input: { seq: bigint; headHash: string; hmac: string }) {
    return prisma.auditCheckpoint.create({ data: input, select: { id: true, seq: true } });
  },

  last() {
    return prisma.auditCheckpoint.findFirst({
      orderBy: { seq: "desc" },
      select: { seq: true, headHash: true, hmac: true, createdAt: true },
    });
  },

  list() {
    return prisma.auditCheckpoint.findMany({
      orderBy: { seq: "asc" },
      select: { seq: true, headHash: true, hmac: true, createdAt: true },
    });
  },
};
