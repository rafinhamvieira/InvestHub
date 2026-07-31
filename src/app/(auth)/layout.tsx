import type { ReactNode } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-[hsl(222,47%,8%)] to-[hsl(222,47%,14%)] p-12 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <TrendingUp className="size-6" />
          InvestHub
        </Link>
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Seu assistente pessoal de investimentos na B3.
          </h1>
          <p className="max-w-md text-white/70">
            Carteira, dividendos, valuation e recomendações em um só lugar — com a clareza que
            suas decisões financeiras merecem.
          </p>
        </div>
        <p className="text-xs text-white/40">© {new Date().getFullYear()} InvestHub</p>
      </div>
      <div className="flex w-full items-center justify-center bg-background p-6 lg:w-1/2">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
