import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { authService, AuthError } from "@/services/auth.service";
import { loginSchema } from "@/schemas/auth.schema";
import { getClientIp, getUserAgent } from "@/utils/request";
import { logger } from "@/lib/logger";
import { auditService } from "@/services/audit.service";
import { sessionService } from "@/services/session.service";
import { AUDIT_ACTIONS } from "@/constants/audit";

/**
 * Ponte entre o `signIn` (que cria a sessão) e o callback `jwt` (que grava o id no token).
 * O Auth.js não passa dado de um para o outro; o mapa vive um instante e é consumido na
 * primeira leitura.
 */
const pendingSessions = new Map<string, string>();

export function takePendingSession(userId: string): string | undefined {
  const sessionId = pendingSessions.get(userId);
  if (sessionId) pendingSessions.delete(userId);
  return sessionId;
}

class LoginError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  events: {
    /**
     * Registro da sessão e do acesso.
     *
     * Acontece em `events`, e não no `authorize`, porque aqui o login já é um fato — o
     * Auth.js só dispara depois de aceitar as credenciais. É o ponto onde a sessão ganha
     * identidade, sem a qual não há como listar acessos nem revogar nenhum deles.
     */
    async signIn({ user }) {
      if (!user?.id || !user.email) return;

      const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);

      try {
        const sessionId = await sessionService.start({
          userId: user.id,
          email: user.email,
          ipAddress,
          userAgent,
        });

        await auditService.record({
          action: AUDIT_ACTIONS.LOGIN_SUCCESS,
          userId: user.id,
          targetEmail: user.email,
          actorId: user.id,
          actorEmail: user.email,
          sessionId,
          ipAddress,
          userAgent,
        });

        // O token ainda não existe neste ponto; o callback `jwt` lê daqui.
        pendingSessions.set(user.id, sessionId);
      } catch (error) {
        logger.error("Falha ao registrar sessão de login", { error: (error as Error).message });
        throw error;
      }
    },

    async signOut(message) {
      const token = "token" in message ? message.token : null;
      const sessionId = (token as { sessionId?: string } | null)?.sessionId;
      const userId = (token as { id?: string } | null)?.id;
      if (!sessionId || !userId) return;

      const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      await sessionService
        .revoke({
          sessionId,
          userId,
          userEmail: user?.email ?? "",
          revokedBy: userId,
          actorEmail: user?.email ?? null,
          reason: "Logout do usuário",
          ipAddress,
          userAgent,
        })
        .catch((error) => logger.error("Falha ao encerrar sessão", { error: String(error) }));

      await auditService
        .record({
          action: AUDIT_ACTIONS.LOGOUT,
          userId,
          targetEmail: user?.email ?? null,
          actorId: userId,
          actorEmail: user?.email ?? null,
          sessionId,
          ipAddress,
          userAgent,
        })
        .catch((error) => logger.error("Falha ao auditar logout", { error: String(error) }));
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Acrescenta o id da sessão ao token.
     *
     * Fica na instância Node, e não em `auth.config`, porque só aqui existe acesso ao banco
     * — o middleware roda em edge e apenas lê o token pronto.
     */
    async jwt(params) {
      const token = await authConfig.callbacks!.jwt!(params);
      if (params.user?.id) {
        const sessionId = takePendingSession(params.user.id);
        if (sessionId) (token as { sessionId?: string }).sessionId = sessionId;
      }
      return token;
    },

    async session(params) {
      const session = await authConfig.callbacks!.session!(params);
      const sessionId = (params.token as { sessionId?: string }).sessionId;
      if (sessionId && session.user) {
        (session.user as { sessionId?: string }).sessionId = sessionId;
      }
      return session;
    },
  },
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
          logger.warn("Credenciais em formato inválido", {
            issues: parsed.error.flatten().fieldErrors,
          });
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
