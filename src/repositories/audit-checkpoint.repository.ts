import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

/** Ver `audit-log.repository`: o ensaio de restauração confere as âncoras do banco temporário. */
type Db = Pick<PrismaClient, "auditCheckpoint">;

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

  list(client: Db = prisma) {
    return client.auditCheckpoint.findMany({
      orderBy: { seq: "asc" },
      select: { seq: true, headHash: true, hmac: true, createdAt: true },
    });
  },
};
