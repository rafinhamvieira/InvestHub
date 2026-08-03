import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Amostras de saúde: escrita simples, leitura agregada.
 *
 * A agregação é SQL cru porque o Prisma não expõe `date_trunc`, e agrupar por hora é
 * justamente o que transforma 288 pontos diários num gráfico legível. Fazer isso em
 * JavaScript significaria trazer a janela inteira para a memória a cada abertura da tela.
 */

/** Granularidades oferecidas. Nomes fixos: entram numa consulta que não aceita parâmetro. */
export type Bucket = "hour" | "day";

export interface HealthBucket {
  /** Início do intervalo, em ISO. */
  at: string;
  samples: number;
  /** Amostras cujo estado não era `ok` — a base do percentual de disponibilidade. */
  degraded: number;
  databaseMsAvg: number | null;
  databaseMsMax: number | null;
  cacheMsAvg: number | null;
  syncFailuresMax: number | null;
  coverageAvg: number | null;
}

export const healthSampleRepository = {
  create(data: Prisma.HealthSampleCreateInput) {
    return prisma.healthSample.create({ data, select: { id: true } });
  },

  newest() {
    return prisma.healthSample.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
  },

  /**
   * Série agregada de `since` até agora.
   *
   * `bucket` vem de um tipo fechado e nunca de entrada do usuário: ele é interpolado no SQL
   * porque `date_trunc` não aceita o intervalo como parâmetro ligado.
   */
  async series(since: Date, bucket: Bucket): Promise<HealthBucket[]> {
    const rows = await prisma.$queryRawUnsafe<
      {
        at: Date;
        samples: bigint;
        degraded: bigint;
        databaseMsAvg: number | null;
        databaseMsMax: number | null;
        cacheMsAvg: number | null;
        syncFailuresMax: number | null;
        coverageAvg: number | null;
      }[]
    >(
      `
      SELECT
        date_trunc('${bucket}', "createdAt") AS "at",
        count(*)                              AS "samples",
        count(*) FILTER (WHERE "status" <> 'ok') AS "degraded",
        avg("databaseMs")::float              AS "databaseMsAvg",
        max("databaseMs")::float              AS "databaseMsMax",
        avg("cacheMs")::float                 AS "cacheMsAvg",
        max("syncFailures")::float            AS "syncFailuresMax",
        avg("coverage")::float                AS "coverageAvg"
      FROM "health_samples"
      WHERE "createdAt" >= $1
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      since,
    );

    return rows.map((row) => ({
      at: row.at.toISOString(),
      samples: Number(row.samples),
      degraded: Number(row.degraded),
      databaseMsAvg: row.databaseMsAvg,
      databaseMsMax: row.databaseMsMax,
      cacheMsAvg: row.cacheMsAvg,
      syncFailuresMax: row.syncFailuresMax,
      coverageAvg: row.coverageAvg,
    }));
  },

  /** Expurgo por idade. A série antiga não responde nenhuma pergunta que alguém faça. */
  prune(before: Date) {
    return prisma.healthSample.deleteMany({ where: { createdAt: { lt: before } } });
  },
};
