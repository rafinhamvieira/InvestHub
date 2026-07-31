import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { alertService } from "@/services/alert.service";
import { logger } from "@/lib/logger";

/**
 * Avalia alertas ativos.
 * - Usuário autenticado: avalia apenas os próprios alertas (botão "Verificar agora").
 * - Header x-cron-secret válido: avalia todos (chamado pelo job de integrações).
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret");

  try {
    if (cronSecret && providedSecret === cronSecret) {
      const triggered = await alertService.evaluate();
      return NextResponse.json({ triggered });
    }

    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const triggered = await alertService.evaluate(session.user.id);
    return NextResponse.json({ triggered });
  } catch (error) {
    logger.error("Falha ao avaliar alertas", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
