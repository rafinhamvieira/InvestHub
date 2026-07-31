import type { NextAuthConfig } from "next-auth";

/**
 * Configuração edge-safe do Auth.js — usada pelo middleware.
 * NÃO pode importar Prisma, Redis, bcrypt ou qualquer módulo Node-only.
 * Os providers completos (Credentials) ficam em src/lib/auth.ts (runtime Node).
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "USER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
  trustHost: true,
} satisfies NextAuthConfig;
