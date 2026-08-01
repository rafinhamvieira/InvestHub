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
  /** Preenchido só em renda fixa: remuneração e vencimento no lugar de "preço". */
  fixedIncome: FixedIncomeDTO | null;
}

/** Um grupo da carteira: uma classe de ativo com seus totais. */
export interface PortfolioGroup {
  assetType: AssetType;
  label: string;
  positions: PositionDTO[];
  totalValue: number;
  totalInvested: number;
  profit: number;
  /** Fração. */
  profitPercent: number;
  /** Variação do dia, fração — null quando não há cotação de ontem. */
  dayChange: number | null;
  /** Fração do patrimônio. */
  weight: number;
  /** Meta de alocação da classe, se definida. */
  target: number | null;
}

/**
 * Condições do título já formatadas para a tela e para o formulário de edição.
 * Strings porque é assim que os inputs trabalham; a coerção acontece no schema.
 */
export interface FixedIncomeDTO {
  name: string;
  issuer: string;
  indexer: "SELIC" | "CDI" | "IPCA" | "PREFIXADO";
  indexPercent: string;
  spreadPercent: string;
  /** yyyy-MM-dd, ou vazio quando não há vencimento. */
  maturityDate: string;
  /** Rótulo pronto: "110% do CDI", "IPCA + 6,00% a.a.". */
  remuneration: string;
}

export interface TransactionDTO {
  id: string;
  ticker: string;
  name: string;
  assetType: AssetType;
  /** Preenchido só em renda fixa. */
  fixedIncome: FixedIncomeDTO | null;
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
  /** Mesmas posições, agrupadas por classe — é assim que a carteira é exibida. */
  groups: PortfolioGroup[];
  transactions: TransactionDTO[];
  totals: PortfolioTotals;
  brokers: string[];
}
