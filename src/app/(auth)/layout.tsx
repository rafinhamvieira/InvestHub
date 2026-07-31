import type { ReactNode } from "react";
import Link from "next/link";
import { LogoLockup } from "@/components/shared/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0B1730] to-[#152A50] p-12 text-white lg:flex">
        <Link href="/" aria-label="InvestHub">
          <LogoLockup size={132} />
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
        <div className="w-full max-w-sm space-y-8">
          {/* Em telas estreitas o painel da marca some, então repetimos a marca aqui. */}
          <Link href="/" aria-label="InvestHub" className="flex justify-center lg:hidden">
            <LogoLockup size={104} />
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
