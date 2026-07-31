/** Avaliação pura das condições de alerta. Retorna null quando faltam dados para decidir. */

import type { AlertType } from "@prisma/client";

export interface AlertMarketData {
  price: number | null;
  /** DY em percentual (8.5 = 8.5%). */
  dividendYield: number | null;
  pl: number | null;
  /** Margem média de valuation em fração (0.2 = 20%). */
  averageMargin: number | null;
  /** Existe provento declarado após a criação/rearme do alerta. */
  hasNewDividend: boolean;
}

export function checkAlertCondition(
  type: AlertType,
  targetValue: number,
  data: AlertMarketData,
): boolean | null {
  switch (type) {
    case "PRICE_ABOVE":
      return data.price === null ? null : data.price >= targetValue;
    case "PRICE_BELOW":
      return data.price === null ? null : data.price <= targetValue;
    case "DIVIDEND_YIELD_ABOVE":
      return data.dividendYield === null ? null : data.dividendYield >= targetValue;
    case "PL_BELOW":
      if (data.pl === null) return null;
      return data.pl > 0 && data.pl <= targetValue;
    case "FAIR_PRICE_MARGIN_REACHED":
      // targetValue em percentual (20 = 20% de margem).
      return data.averageMargin === null ? null : data.averageMargin * 100 >= targetValue;
    case "NEW_DIVIDEND_DECLARED":
      return data.hasNewDividend;
    default:
      return null;
  }
}

export function describeAlert(type: AlertType, targetValue: number, ticker: string): string {
  switch (type) {
    case "PRICE_ABOVE":
      return `${ticker} atingiu ou superou R$ ${targetValue.toFixed(2).replace(".", ",")}`;
    case "PRICE_BELOW":
      return `${ticker} caiu para R$ ${targetValue.toFixed(2).replace(".", ",")} ou menos`;
    case "DIVIDEND_YIELD_ABOVE":
      return `Dividend Yield de ${ticker} atingiu ${targetValue.toFixed(1).replace(".", ",")}%`;
    case "PL_BELOW":
      return `P/L de ${ticker} caiu para ${targetValue.toFixed(1).replace(".", ",")} ou menos`;
    case "FAIR_PRICE_MARGIN_REACHED":
      return `${ticker} atingiu margem de segurança de ${targetValue.toFixed(0)}%`;
    case "NEW_DIVIDEND_DECLARED":
      return `${ticker} declarou um novo provento`;
    default:
      return ticker;
  }
}
