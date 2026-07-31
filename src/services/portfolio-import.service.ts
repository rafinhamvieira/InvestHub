import { assetRepository } from "@/repositories/asset.repository";
import { brokerRepository } from "@/repositories/broker.repository";
import { transactionRepository } from "@/repositories/transaction.repository";
import { positionRepository } from "@/repositories/position.repository";
import { prisma } from "@/lib/prisma";
import { computePositions, type LedgerEntry } from "@/utils/portfolio-math";
import type { ImportParseError, ParsedImportRow } from "@/utils/import-parser";

export interface ImportReport {
  totalRows: number;
  importable: number;
  imported: number;
  errors: ImportParseError[];
  /** Tickers que serão criados por não existirem ainda. */
  newTickers: string[];
  dryRun: boolean;
}

/**
 * Importação em lote: valida vendas contra o ledger combinado (existente + importado,
 * em ordem de data), cria transações e recalcula cada posição afetada uma única vez.
 */
export const portfolioImportService = {
  async importRows(
    userId: string,
    rows: ParsedImportRow[],
    parseErrors: ImportParseError[],
    dryRun: boolean,
  ): Promise<ImportReport> {
    const errors = [...parseErrors];
    const tickers = [...new Set(rows.map((r) => r.ticker))];

    // Ativos existentes (sem criar nada em dry-run).
    const existingAssets = await Promise.all(tickers.map((t) => assetRepository.findByTicker(t)));
    const assetIdByTicker = new Map<string, string>();
    const newTickers: string[] = [];
    tickers.forEach((ticker, i) => {
      const asset = existingAssets[i];
      if (asset) assetIdByTicker.set(ticker, asset.id);
      else newTickers.push(ticker);
    });

    // Valida vendas: para cada ticker, simula o ledger existente + linhas novas em ordem de data.
    const validRows: ParsedImportRow[] = [];
    for (const ticker of tickers) {
      const tickerRows = rows.filter((r) => r.ticker === ticker);
      const assetId = assetIdByTicker.get(ticker);

      const existingLedger: LedgerEntry[] = assetId
        ? (await transactionRepository.findAllByUserAndAsset(userId, assetId)).map((t) => ({
            assetId: ticker,
            type: t.type,
            quantity: Number(t.quantity),
            price: Number(t.price),
            fees: Number(t.fees),
            date: t.date,
          }))
        : [];

      const combined = [
        ...existingLedger.map((e) => ({ entry: e, row: null as ParsedImportRow | null })),
        ...tickerRows.map((r) => ({
          entry: {
            assetId: ticker,
            type: r.type,
            quantity: r.quantity,
            price: r.price,
            fees: r.fees,
            date: r.date,
          } satisfies LedgerEntry,
          row: r,
        })),
      ].sort((a, b) => a.entry.date.getTime() - b.entry.date.getTime());

      let quantityHeld = 0;
      const rejected = new Set<number>();
      for (const { entry, row } of combined) {
        if (entry.type === "BUY") {
          quantityHeld += entry.quantity;
        } else if (entry.quantity <= quantityHeld) {
          quantityHeld -= entry.quantity;
        } else if (row) {
          rejected.add(row.line);
          errors.push({
            line: row.line,
            message: `Venda de ${entry.quantity} ${ticker} excede a custódia na data (${quantityHeld}).`,
          });
        } else {
          // Ledger existente inconsistente não bloqueia a importação das novas linhas.
          quantityHeld = 0;
        }
      }

      validRows.push(...tickerRows.filter((r) => !rejected.has(r.line)));
    }

    const report: ImportReport = {
      totalRows: rows.length + parseErrors.length,
      importable: validRows.length,
      imported: 0,
      errors: errors.sort((a, b) => a.line - b.line),
      newTickers,
      dryRun,
    };

    if (dryRun || validRows.length === 0) return report;

    // ---------- Efetiva ----------
    for (const ticker of newTickers) {
      const row = validRows.find((r) => r.ticker === ticker);
      if (!row) continue;
      const asset = await assetRepository.findOrCreate(ticker, row.assetType);
      assetIdByTicker.set(ticker, asset.id);
    }

    const brokerNames = [...new Set(validRows.map((r) => r.brokerName).filter(Boolean))];
    const brokerIdByName = new Map<string, string>();
    for (const name of brokerNames) {
      const broker = await brokerRepository.findOrCreate(userId, name);
      brokerIdByName.set(name, broker.id);
    }

    await prisma.transaction.createMany({
      data: validRows.map((row) => ({
        userId,
        assetId: assetIdByTicker.get(row.ticker)!,
        brokerId: row.brokerName ? (brokerIdByName.get(row.brokerName) ?? null) : null,
        type: row.type,
        quantity: row.quantity,
        price: row.price,
        fees: row.fees,
        date: row.date,
        notes: row.notes || null,
      })),
    });

    // Recalcula cada posição afetada uma única vez.
    const affectedAssetIds = [...new Set(validRows.map((r) => assetIdByTicker.get(r.ticker)!))];
    for (const assetId of affectedAssetIds) {
      const ledgerRows = await transactionRepository.findAllByUserAndAsset(userId, assetId);
      const position = computePositions(
        ledgerRows.map((t) => ({
          assetId,
          type: t.type,
          quantity: Number(t.quantity),
          price: Number(t.price),
          fees: Number(t.fees),
          date: t.date,
        })),
      ).get(assetId);

      if (!position || position.quantity <= 0) {
        await positionRepository.delete(userId, assetId);
      } else {
        await positionRepository.upsert(userId, assetId, {
          quantity: position.quantity,
          averagePrice: position.averagePrice,
          totalInvested: position.totalInvested,
        });
      }
    }

    report.imported = validRows.length;
    return report;
  },
};
