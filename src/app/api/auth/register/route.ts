import { NextResponse } from "next/server";
import { registerSchema } from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.flatten() }, { status: 400 });
  }

  const ipAddress = await getClientIp();
  const userAgent = await getUserAgent();

  const rateLimit = await checkRateLimit({
    key: "register",
    identifier: ipAddress,
    max: 5,
    windowSeconds: 3600,
  });
  if (!rateLimit.success) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    await authService.register(parsed.data, { ipAddress, userAgent });
  } catch (error) {
    logger.error("Falha ao registrar usuário", { error: (error as Error).message });
    return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
  }

  // Resposta genérica independente de o e-mail já existir (evita enumeração de usuários).
  return NextResponse.json({
    message: "Se o e-mail informado for válido, você receberá instruções de confirmação.",
  });
}
