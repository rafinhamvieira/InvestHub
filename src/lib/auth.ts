import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { authService, AuthError } from "@/services/auth.service";
import { loginSchema } from "@/schemas/auth.schema";
import { getClientIp, getUserAgent } from "@/utils/request";

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
          if (error instanceof AuthError) {
            throw new LoginError(error.code);
          }
          throw new LoginError("UNKNOWN_ERROR");
        }
      },
    }),
  ],
});
