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

/** Tamanho de arquivo legível. Mora aqui, e não junto da lógica de backup, porque a tela
 * roda no navegador — e aquele módulo lida com caminhos, que é código só de servidor. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}
