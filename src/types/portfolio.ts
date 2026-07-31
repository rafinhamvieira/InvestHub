import type { AssetType, TransactionType } from "@prisma/client";

export interface PositionDTO {
  assetId: string;
  ticker: string;
  name: string;
  assetType: AssetType;
  sector: string | null;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
  currentPrice: number;
  currentValue: number;
  profit: number;
  /** Fração. */
  profitPercent: number;
  /** Fração do patrimônio total. */
  weight: number;
}

export interface TransactionDTO {
  id: string;
  ticker: string;
  assetType: AssetType;
  type: TransactionType;
  quantity: number;
  price: number;
  fees: number;
  total: number;
  /** ISO string para serialização estável server → client. */
  date: string;
  brokerName: string | null;
  notes: string | null;
}

export interface PortfolioTotals {
  totalValue: number;
  totalInvested: number;
  profit: number;
  profitPercent: number;
}

export interface PortfolioData {
  positions: PositionDTO[];
  transactions: TransactionDTO[];
  totals: PortfolioTotals;
  brokers: string[];
}
