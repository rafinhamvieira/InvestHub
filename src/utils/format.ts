const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(value);
}

/** Recebe fração (0.1234 → "12,34%"). */
export function formatPercent(fraction: number): string {
  return percentFormatter.format(fraction);
}

export function formatSignedPercent(fraction: number): string {
  const formatted = percentFormatter.format(Math.abs(fraction));
  return fraction >= 0 ? `+${formatted}` : `-${formatted}`;
}
