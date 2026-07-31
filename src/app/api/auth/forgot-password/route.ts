import { NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";
import { getClientIp, getUserAgent } from "@/utils/request";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const ipAddress = await getClientIp();
  const userAgent = await getUserAgent();

  try {
    await authService.requestPasswordReset(parsed.data.email, { ipAddress, userAgent });
  } catch (error) {
    logger.error("Falha ao solicitar redefinição de senha", { error: (error as Error).message });
  }

  return NextResponse.json({
    message: "Se o e-mail informado existir, você receberá um link de redefinição.",
  });
}
