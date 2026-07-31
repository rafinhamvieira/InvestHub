export type ScreenerValue = string | number | null;

export interface ScreenerRow {
  assetId: string;
  ticker: string;
  name: string;
  favorite: boolean;
  /** Indicadores dinâmicos (pl, pvp, dy...). */
  [key: string]: ScreenerValue | boolean;
}

export type ColumnFormat = "currency" | "percent" | "number" | "compact" | "text" | "score";

export interface ScreenerColumn {
  key: string;
  label: string;
  format: ColumnFormat;
  /** Largura mínima opcional (classe Tailwind). */
  minWidth?: string;
}

export type FilterKind = "range" | "select" | "text";

export interface ScreenerFilterDef {
  key: string;
  label: string;
  kind: FilterKind;
  /** Sufixo de unidade exibido nos inputs de range (ex: "%"). */
  unit?: string;
}

export interface FilterValue {
  min?: number;
  max?: number;
  value?: string;
}

export type FilterValues = Record<string, FilterValue>;

export interface ScreenerConfig {
  title: string;
  description: string;
  csvName: string;
  columns: ScreenerColumn[];
  filters: ScreenerFilterDef[];
}
