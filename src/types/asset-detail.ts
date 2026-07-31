import type { AssetType } from "@prisma/client";
import type { ValuationSummary } from "@/types/valuation";
import type { AssetScore } from "@/types/score";

export interface OhlcPoint {
  /** yyyy-MM-dd (formato do lightweight-charts). */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface IndicatorItem {
  label: string;
  value: number | string | null;
  format: "currency" | "percent" | "number" | "compact" | "text";
}

export interface IndicatorGroup {
  title: string;
  items: IndicatorItem[];
}

export interface DividendItem {
  id: string;
  type: string;
  valuePerShare: number;
  /** ISO strings. */
  exDate: string;
  paymentDate: string | null;
}

export interface DividendYearPoint {
  year: string;
  total: number;
}

export interface HistorySeries {
  key: "dy" | "pl" | "pvp" | "roe";
  label: string;
  format: "percent" | "number";
  points: Array<{ date: string; value: number }>;
}

export interface UserPositionSummary {
  quantity: number;
  averagePrice: number;
  totalInvested: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
}

export interface AssetDetail {
  assetId: string;
  ticker: string;
  name: string;
  type: AssetType;
  sector: string | null;
  description: string | null;
  favorite: boolean;
  price: number | null;
  /** Variação vs fechamento anterior (fração), quando há 2+ candles. */
  dayChange: number | null;
  ohlc: OhlcPoint[];
  indicatorGroups: IndicatorGroup[];
  dividends: DividendItem[];
  dividendsByYear: DividendYearPoint[];
  historySeries: HistorySeries[];
  position: UserPositionSummary | null;
  valuation: ValuationSummary;
  score: AssetScore;
}
