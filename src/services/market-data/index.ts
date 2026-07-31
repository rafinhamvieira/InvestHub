import { BrapiProvider } from "@/services/market-data/brapi.provider";
import { BolsaiProvider } from "@/services/market-data/bolsai.provider";
import type { FundamentalsProvider, MarketDataProvider } from "@/types/market-data";

let marketProvider: MarketDataProvider | null = null;
let fundamentalsProvider: BolsaiProvider | null = null;

/**
 * Fonte de cotações e histórico de preços.
 * Para trocar de fonte, implemente MarketDataProvider e ajuste aqui.
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (!marketProvider) marketProvider = new BrapiProvider();
  return marketProvider;
}

/**
 * Fonte de indicadores fundamentalistas.
 * Retorna null quando não há chave configurada — o sistema segue apenas com cotações.
 */
export function getFundamentalsProvider(): FundamentalsProvider | null {
  if (!fundamentalsProvider) fundamentalsProvider = new BolsaiProvider();
  return fundamentalsProvider.isConfigured ? fundamentalsProvider : null;
}
