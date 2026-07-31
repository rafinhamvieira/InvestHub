/** Filtro e ordenação puros do screener — sem I/O, testáveis isoladamente. */

import type { FilterValues, ScreenerRow, ScreenerValue } from "@/types/screener";

export function applyFilters(rows: ScreenerRow[], filters: FilterValues): ScreenerRow[] {
  const active = Object.entries(filters).filter(([, f]) => {
    return f.min !== undefined || f.max !== undefined || (f.value !== undefined && f.value !== "");
  });
  if (active.length === 0) return rows;

  return rows.filter((row) =>
    active.every(([key, filter]) => {
      const raw = row[key];

      if (filter.value !== undefined && filter.value !== "") {
        if (raw === null || raw === undefined) return false;
        return String(raw).toLowerCase().includes(filter.value.toLowerCase());
      }

      // Range: valores ausentes são excluídos quando o filtro está ativo.
      if (typeof raw !== "number") return false;
      if (filter.min !== undefined && raw < filter.min) return false;
      if (filter.max !== undefined && raw > filter.max) return false;
      return true;
    }),
  );
}

export function applySearch(rows: ScreenerRow[], query: string): ScreenerRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (row) => row.ticker.toLowerCase().includes(q) || row.name.toLowerCase().includes(q),
  );
}

export function sortRows(
  rows: ScreenerRow[],
  key: string,
  direction: "asc" | "desc",
): ScreenerRow[] {
  const factor = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const va = a[key] as ScreenerValue;
    const vb = b[key] as ScreenerValue;

    // Nulos sempre por último, independente da direção.
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;

    if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
    return String(va).localeCompare(String(vb)) * factor;
  });
}
