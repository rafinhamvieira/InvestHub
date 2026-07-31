import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { authService, AuthError } from "@/services/auth.service";
import { loginSchema } from "@/schemas/auth.schema";
import { getClientIp, getUserAgent } from "@/utils/request";
import { logger } from "@/lib/logger";

class LoginError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail" },
        password: { label: "Senha" },
        totpCode: { label: "Código 2FA" },
        recoveryCode: { label: "Código de recuperação" },
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          throw new LoginError("INVALID_CREDENTIALS");
        }

        const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);

        try {
          return await authService.authenticate(parsed.data, { ipAddress, userAgent });
        } catch (error) {
          // O Auth.js registra apenas "CredentialsSignin", sem o motivo. Logamos aqui para
          // que a causa apareça em `docker compose logs app` durante a operação.
          if (error instanceof AuthError) {
            logger.warn("Login recusado", { email: parsed.data.email, code: error.code, ipAddress });
            throw new LoginError(error.code);
          }
          logger.error("Erro inesperado no login", {
            email: parsed.data.email,
            error: (error as Error).message,
          });
          throw new LoginError("UNKNOWN_ERROR");
        }
      },
    }),
  ],
});
