import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncHealthService } from "@/services/sync-health.service";
import { healthSampleService } from "@/services/health-sample.service";

/**
 * Saúde da aplicação — chamado pelo healthcheck do Docker a cada 15 segundos.
 *
 * Duas rotinas pegam carona aqui, pelo mesmo motivo: esta é a única coisa que roda de forma
 * garantida e frequente, então quem precisa de cadência ganha um agendador de graça.
 *
 *  - **o vigia da sincronização**, porque job que morreu não gera erro para ninguém contar;
 *  - **a amostra de saúde**, que alimenta a série histórica com sua própria cadência,
 *    bem mais lenta que a deste endpoint.
 *
 * O status HTTP continua refletindo só o banco. Sync atrasado é problema de dados, e falha
 * ao amostrar é problema da medição — nenhum dos dois é motivo para o orquestrador julgar o
 * container doente e reiniciá-lo.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }

  const sync = await syncHealthService.checkStaleness();
  await healthSampleService.collectIfDue();

  return NextResponse.json({ status: "ok", sync });
}
