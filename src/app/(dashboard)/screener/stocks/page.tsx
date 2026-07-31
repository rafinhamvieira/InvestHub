import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { screenerService } from "@/services/screener.service";
import { ScreenerShell } from "@/components/screener/screener-shell";
import { STOCK_SCREENER_CONFIG } from "@/config/screener-stocks";

export const metadata: Metadata = { title: "Screener de Ações" };

export default async function StockScreenerPage() {
  const session = await auth();
  const rows = await screenerService.getStockScreener(session!.user.id);

  return <ScreenerShell config={STOCK_SCREENER_CONFIG} rows={rows} />;
}
