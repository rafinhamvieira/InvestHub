import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncHealthService } from "@/services/sync-health.service";

/**
 * Saúde da aplicação — chamado pelo healthcheck do Docker a cada 15 segundos.
 *
 * A verificação do sync pega carona aqui de propósito: job que morreu não gera erro para
 * ninguém contar, e esta é a única rotina que roda de forma garantida e frequente. O
 * status HTTP continua refletindo só o banco: sync atrasado é problema de dados, não
 * motivo para o orquestrador reiniciar o container.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }

  const sync = await syncHealthService.checkStaleness();
  return NextResponse.json({ status: "ok", sync });
}
