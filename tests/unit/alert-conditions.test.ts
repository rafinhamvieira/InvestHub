import { describe, expect, it } from "vitest";
import { checkAlertCondition, type AlertMarketData } from "@/utils/alert-conditions";

const base: AlertMarketData = {
  price: 30,
  dividendYield: 8,
  pl: 5,
  averageMargin: 0.25,
  hasNewDividend: false,
};

describe("checkAlertCondition", () => {
  it("PRICE_ABOVE / PRICE_BELOW", () => {
    expect(checkAlertCondition("PRICE_ABOVE", 28, base)).toBe(true);
    expect(checkAlertCondition("PRICE_ABOVE", 35, base)).toBe(false);
    expect(checkAlertCondition("PRICE_BELOW", 32, base)).toBe(true);
    expect(checkAlertCondition("PRICE_BELOW", 25, base)).toBe(false);
  });

  it("DIVIDEND_YIELD_ABOVE", () => {
    expect(checkAlertCondition("DIVIDEND_YIELD_ABOVE", 6, base)).toBe(true);
    expect(checkAlertCondition("DIVIDEND_YIELD_ABOVE", 10, base)).toBe(false);
  });

  it("PL_BELOW exige P/L positivo", () => {
    expect(checkAlertCondition("PL_BELOW", 6, base)).toBe(true);
    expect(checkAlertCondition("PL_BELOW", 4, base)).toBe(false);
    expect(checkAlertCondition("PL_BELOW", 6, { ...base, pl: -2 })).toBe(false);
  });

  it("FAIR_PRICE_MARGIN_REACHED compara com percentual", () => {
    expect(checkAlertCondition("FAIR_PRICE_MARGIN_REACHED", 20, base)).toBe(true);
    expect(checkAlertCondition("FAIR_PRICE_MARGIN_REACHED", 30, base)).toBe(false);
  });

  it("NEW_DIVIDEND_DECLARED", () => {
    expect(checkAlertCondition("NEW_DIVIDEND_DECLARED", 0, base)).toBe(false);
    expect(checkAlertCondition("NEW_DIVIDEND_DECLARED", 0, { ...base, hasNewDividend: true })).toBe(
      true,
    );
  });

  it("retorna null quando faltam dados", () => {
    expect(checkAlertCondition("PRICE_ABOVE", 10, { ...base, price: null })).toBeNull();
    expect(checkAlertCondition("PL_BELOW", 10, { ...base, pl: null })).toBeNull();
    expect(
      checkAlertCondition("FAIR_PRICE_MARGIN_REACHED", 10, { ...base, averageMargin: null }),
    ).toBeNull();
  });
});
