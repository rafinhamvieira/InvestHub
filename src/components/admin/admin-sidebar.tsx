"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_NAV } from "@/config/admin-nav";

/**
 * Barra lateral do painel administrativo.
 *
 * Visualmente distinta da área de investimentos de propósito: quem está aqui precisa saber
 * que está operando sobre contas de outras pessoas, não sobre a própria carteira.
 */
export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <ShieldCheck className="size-5 text-warning" />
        <span className="text-sm font-semibold tracking-tight">Administração</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        {ADMIN_NAV.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-start gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-warning/10 text-warning"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block">{item.title}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar aos investimentos
        </Link>
      </div>
    </aside>
  );
}
