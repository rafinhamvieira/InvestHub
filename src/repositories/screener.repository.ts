import { prisma } from "@/lib/prisma";
import type { AssetType } from "@prisma/client";

export const screenerRepository = {
  /** Ativos ativos do(s) tipo(s) informado(s). Fundamentos/preços buscados à parte (snapshot mais recente). */
  findAssetsByTypes(types: AssetType[]) {
    return prisma.asset.findMany({
      where: { type: { in: types }, isActive: true },
      select: {
        id: true,
        ticker: true,
        name: true,
        type: true,
        sector: true,
        subsector: true,
        segment: true,
      },
      orderBy: { ticker: "asc" },
    });
  },
};
