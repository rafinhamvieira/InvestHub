import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { hasAdminAccess } from "@/lib/permissions";
import type { Role } from "@prisma/client";

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

  // Área administrativa: primeira das duas barreiras.
  //
  // Aqui só dá para olhar o papel gravado no token, que é do momento do login e vale 30
  // dias — um administrador rebaixado ontem ainda passaria por esta linha. Por isso cada
  // rota chama `requireAdmin()`, que confere o papel no banco. Esta camada existe para
  // evitar que a tela sequer carregue, e para o 403 sair antes de tocar o banco.
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    // Triagem pelo token: o cargo aqui pode estar desatualizado, então o guard de cada rota
    // confere de novo no banco. Esta camada evita que a tela sequer comece a carregar.
    const role = (req.auth?.user as { role?: Role } | undefined)?.role;

    if (!isLoggedIn || !role || !hasAdminAccess({ id: "", role })) {
      return isApiRoute
        ? NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
        : NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
    }
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
