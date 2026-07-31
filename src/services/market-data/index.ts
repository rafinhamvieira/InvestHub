import { BrapiProvider } from "@/services/market-data/brapi.provider";
import type { MarketDataProvider } from "@/types/market-data";

let provider: MarketDataProvider | null = null;

/** Provedor ativo. Para trocar de fonte de dados, basta implementar MarketDataProvider e ajustar aqui. */
export function getMarketDataProvider(): MarketDataProvider {
  if (!provider) provider = new BrapiProvider();
  return provider;
}
