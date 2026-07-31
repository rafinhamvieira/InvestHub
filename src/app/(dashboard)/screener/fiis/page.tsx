import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { screenerService } from "@/services/screener.service";
import { ScreenerShell } from "@/components/screener/screener-shell";
import { FII_SCREENER_CONFIG } from "@/config/screener-fiis";

export const metadata: Metadata = { title: "Screener de FIIs" };

export default async function FiiScreenerPage() {
  const session = await auth();
  const rows = await screenerService.getFiiScreener(session!.user.id);

  return <ScreenerShell config={FII_SCREENER_CONFIG} rows={rows} />;
}
