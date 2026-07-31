import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { watchlistService } from "@/services/watchlist.service";
import { WatchlistView } from "@/components/watchlist/watchlist-view";

export const metadata: Metadata = { title: "Lista de Observação" };

export default async function WatchlistPage() {
  const session = await auth();
  const rows = await watchlistService.getWatchlist(session!.user.id);

  return <WatchlistView rows={rows} />;
}
