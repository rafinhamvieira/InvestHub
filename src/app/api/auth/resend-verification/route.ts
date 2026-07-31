import { NextResponse } from "next/server";
import { resendVerificationSchema } from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";
import { getClientIp, getUserAgent } from "@/utils/request";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = resendVerificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);

  try {
    // O service já ignora e-mails inexistentes ou já confirmados, e aplica rate limit.
    await authService.sendVerificationEmail(parsed.data.email, { ipAddress, userAgent });
  } catch (error) {
    logger.error("Falha ao reenviar confirmação de e-mail", {
      error: (error as Error).message,
    });
  }

  // Resposta genérica: não revela se o e-mail existe nem se já estava confirmado.
  return NextResponse.json({
    message: "Se houver um cadastro pendente para este e-mail, um novo link foi enviado.",
  });
}
