import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Instância edge-safe: só valida o JWT da sessão, sem tocar em Prisma/Redis.
const { auth } = NextAuth(authConfig);

const PUBLIC_API_PREFIXES = ["/api/auth", "/api/health"];

/**
 * Rotas que fazem a própria autenticação: aceitam sessão **ou** o segredo do job agendado.
 *
 * Precisam passar pelo middleware porque ele só enxerga o cookie de sessão — um job não
 * tem sessão, então levava 401 antes de a rota conseguir conferir o header `x-cron-secret`.
 * Passar aqui não abre nada: sem sessão e sem o segredo, o próprio handler devolve 401.
 */
const SELF_AUTHENTICATED_APIS = ["/api/market/sync", "/api/alerts/evaluate"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = Boolean(req.auth);

  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthPage = AUTH_PAGES.some((page) => pathname.startsWith(page));
  const isApiRoute = pathname.startsWith("/api");

  const isSelfAuthenticated = SELF_AUTHENTICATED_APIS.some((route) => pathname === route);

  if (isPublicApi || isSelfAuthenticated) return NextResponse.next();

  if (isApiRoute && !isLoggedIn) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  if (!isAuthPage && !isLoggedIn && !isApiRoute) {
    const redirectUrl = new URL("/login", req.nextUrl.origin);
    redirectUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
