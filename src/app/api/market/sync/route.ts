import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketSyncService } from "@/services/market-sync.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

/**
 * Sincroniza dados de mercado.
 * - Usuário autenticado: sincroniza os ativos da sua carteira/watchlist/alertas/metas (rate-limited).
 * - Header x-cron-secret válido: sincroniza todos os ativos (job agendado).
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret");

  try {
    if (cronSecret && providedSecret === cronSecret) {
      const report = await marketSyncService.syncAll();
      return NextResponse.json(report);
    }

    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const rateLimit = await checkRateLimit({
      key: "market-sync",
      identifier: session.user.id,
      max: 4,
      windowSeconds: 300,
    });
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: "Aguarde alguns minutos entre atualizações." },
        { status: 429 },
      );
    }

    const report = await marketSyncService.syncForUser(session.user.id);
    return NextResponse.json(report);
  } catch (error) {
    logger.error("Falha na sincronização de mercado", { error: (error as Error).message });
    return NextResponse.json({ error: "SYNC_FAILED" }, { status: 500 });
  }
}
