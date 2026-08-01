/**
 * Importa o histórico de proventos do catálogo inteiro de uma vez.
 *
 *   docker compose run --rm migrate npx tsx scripts/backfill-dividends.ts
 *   docker compose run --rm migrate npx tsx scripts/backfill-dividends.ts --all --limit 500
 *
 * A sincronização automática cobre alguns ativos por ciclo para não martelar as fontes;
 * isso leva dias até o Dividend Yield aparecer para o mercado todo no screener. Este
 * script faz o mesmo trabalho de uma vez só, com pausa entre os lotes.
 *
 * Opções:
 *   --all            reprocessa também quem já tem proventos (padrão: só quem não tem)
 *   --limit N        para depois de N ativos
 *   --delay MS       pausa entre ativos (padrão 300ms)
 */
import { prisma } from "../src/lib/prisma";
import { dividendSyncService } from "../src/services/dividend-sync.service";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const all = process.argv.includes("--all");
  const limit = Number(arg("limit") ?? 0);
  const delay = Number(arg("delay") ?? 300);

  const assets = await prisma.asset.findMany({
    where: {
      isActive: true,
      type: { in: ["STOCK", "FII", "BDR"] },
      ...(all ? {} : { dividends: { none: {} } }),
    },
    select: { id: true, ticker: true, type: true },
    orderBy: { ticker: "asc" },
    ...(limit > 0 ? { take: limit } : {}),
  });

  console.log(`${assets.length} ativos na fila (${all ? "todos" : "só os sem proventos"}).`);

  let created = 0;
  let failed = 0;

  for (const [index, asset] of assets.entries()) {
    try {
      const result = await dividendSyncService.syncAsset(asset);
      created += result.created.length;
    } catch (error) {
      failed++;
      console.warn(`${asset.ticker}: ${(error as Error).message}`);
    }

    if ((index + 1) % 25 === 0 || index === assets.length - 1) {
      console.log(`${index + 1}/${assets.length} · ${created} proventos novos · ${failed} falhas`);
    }

    // Pausa entre ativos: as fontes são gratuitas, mas não são nossas.
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }

  console.log(`Concluído: ${created} proventos importados, ${failed} falhas.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
