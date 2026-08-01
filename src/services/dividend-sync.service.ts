/**
 * Sincronização de proventos e avisos ao usuário.
 *
 * Fontes combinadas, ambas públicas e sem chave:
 *  - **B3** — o que foi anunciado, com data-com, data de pagamento e tipo. É o único lado
 *    que enxerga o provento antes de ele cair na conta.
 *  - **Yahoo** — o histórico longo, que a B3 só entrega paginando empresa por empresa.
 *
 * A B3 entra primeiro por ser mais rica: quando o Yahoo traz o mesmo evento, ele é
 * descartado pela deduplicação em vez de virar linha repetida no extrato.
 *
 * Duas notificações saem daqui:
 *  - **declaração** — provento novo anunciado para um ativo em custódia;
 *  - **crédito** — chegou a data de pagamento; o recibo é gravado e o usuário avisado.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendEmail, alertEmailTemplate } from "@/lib/email";
import { assetRepository } from "@/repositories/asset.repository";
import { assetDividendRepository, type StoredDividend } from "@/repositories/asset-dividend.repository";
import { dividendReceiptRepository } from "@/repositories/dividend-receipt.repository";
import { notificationRepository } from "@/repositories/notification.repository";
import { positionRepository } from "@/repositories/position.repository";
import { transactionRepository } from "@/repositories/transaction.repository";
import { B3Provider } from "@/services/market-data/b3.provider";
import { YahooProvider } from "@/services/market-data/yahoo.provider";
import { findDuplicate } from "@/utils/dividend-math";
import { quantityAt, type LedgerEntry } from "@/utils/portfolio-math";
import { formatCurrency } from "@/utils/format";
import { formatDateOnly, toUtcDateOnly } from "@/utils/date";
import type { MarketDividend } from "@/types/market-data";
import type { AssetType } from "@prisma/client";

export interface DividendSyncReport {
  assets: number;
  created: number;
  updated: number;
  notified: number;
  receipts: number;
  failedTickers: string[];
}

interface SyncableAsset {
  id: string;
  ticker: string;
  type: AssetType;
}

/**
 * Só notificamos declarações com data-com recente ou futura. Sem esse corte, a primeira
 * sincronização — que importa 5 anos de histórico de uma vez — dispararia centenas de
 * "novo provento" para eventos pagos há anos.
 */
const DECLARATION_MAX_AGE_DAYS = 20;

const b3 = new B3Provider();
const yahoo = new YahooProvider();

function isFii(type: AssetType): boolean {
  return type === "FII";
}

export const dividendSyncService = {
  /**
   * Importa proventos de um ativo. Retorna os eventos criados nesta rodada — são eles que
   * viram notificação.
   */
  async syncAsset(
    asset: SyncableAsset,
  ): Promise<{ created: StoredDividend[]; updated: number }> {
    const [announced, history] = await Promise.all([
      b3.getAnnouncedDividends(asset.ticker, isFii(asset.type)),
      yahoo.getDividendHistory(asset.ticker),
    ]);

    const stored = await assetDividendRepository.listStored(asset.id);
    const known: StoredDividend[] = [...stored];
    const created: StoredDividend[] = [];
    let updated = 0;

    // Ordem importa: a B3 vem primeiro para o evento nascer com data de pagamento e tipo.
    const incoming: MarketDividend[] = [...announced, ...history];

    for (const event of incoming) {
      const duplicate = findDuplicate(known, event);

      if (duplicate) {
        // Fonte nova completa o que faltava — nunca sobrescreve dado já preenchido.
        const patch: { paymentDate?: Date; declaredAt?: Date; type?: string } = {};
        if (!duplicate.paymentDate && event.paymentDate) patch.paymentDate = event.paymentDate;
        if (!duplicate.declaredAt && event.declaredAt) patch.declaredAt = event.declaredAt;
        if (duplicate.type === "Provento" && event.type !== "Provento") patch.type = event.type;

        if (Object.keys(patch).length > 0) {
          await assetDividendRepository.update(duplicate.id, patch);
          Object.assign(duplicate, patch);
          updated++;
        }
        continue;
      }

      const row = await assetDividendRepository.create(asset.id, event);
      const record: StoredDividend = {
        id: row.id,
        type: row.type,
        valuePerShare: Number(row.valuePerShare),
        exDate: row.exDate,
        paymentDate: row.paymentDate,
        declaredAt: row.declaredAt,
      };
      known.push(record);
      created.push(record);
    }

    return { created, updated };
  },

  /** Sincroniza uma lista de ativos e notifica as declarações novas. */
  async syncAssets(assets: SyncableAsset[]): Promise<DividendSyncReport> {
    const report: DividendSyncReport = {
      assets: assets.length,
      created: 0,
      updated: 0,
      notified: 0,
      receipts: 0,
      failedTickers: [],
    };

    const fresh: Array<{ asset: SyncableAsset; dividend: StoredDividend }> = [];
    const cutoff = new Date(Date.now() - DECLARATION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    for (const asset of assets) {
      try {
        const { created, updated } = await this.syncAsset(asset);
        report.created += created.length;
        report.updated += updated;
        for (const dividend of created) {
          if (dividend.exDate >= cutoff) fresh.push({ asset, dividend });
        }
      } catch (error) {
        logger.warn("Falha ao sincronizar proventos", {
          ticker: asset.ticker,
          error: (error as Error).message,
        });
        report.failedTickers.push(asset.ticker);
      }
    }

    report.notified = await this.notifyDeclarations(fresh);
    return report;
  },

  /**
   * Importa proventos de um punhado de ativos do catálogo por ciclo, priorizando quem não
   * tem nenhum e, entre esses, os mais líquidos.
   *
   * É o que dá Dividend Yield ao screener sem plano pago: com o histórico na base, o yield
   * sai de uma conta local em vez de vir do provedor de fundamentos, que é limitado a 200
   * chamadas por dia.
   */
  async syncStale(limit: number): Promise<number> {
    if (limit <= 0) return 0;

    try {
      const assets = await assetRepository.listStaleDividends(limit, ["STOCK", "FII", "BDR"]);
      const report = await this.syncAssets(assets);
      return report.created;
    } catch (error) {
      logger.error("Falha na rotação de proventos", { error: (error as Error).message });
      return 0;
    }
  },

  /** Sincroniza os proventos de todos os ativos que alguém tem em carteira. */
  async syncAll(): Promise<DividendSyncReport> {
    const held = await prisma.position.findMany({
      where: { quantity: { gt: 0 } },
      select: { asset: { select: { id: true, ticker: true, type: true } } },
      distinct: ["assetId"],
    });

    const report = await this.syncAssets(held.map((position) => position.asset));
    const payments = await this.notifyPayments();
    report.receipts = payments;
    return report;
  },

  /** Avisa quem tem o ativo em carteira de que um provento novo foi declarado. */
  async notifyDeclarations(
    events: Array<{ asset: SyncableAsset; dividend: StoredDividend }>,
  ): Promise<number> {
    if (events.length === 0) return 0;

    const holders = await positionRepository.findHoldersOfAssets([
      ...new Set(events.map((event) => event.asset.id)),
    ]);
    if (holders.length === 0) return 0;

    let notified = 0;

    for (const { asset, dividend } of events) {
      for (const holder of holders.filter((h) => h.assetId === asset.id)) {
        const quantity = Number(holder.quantity);
        const estimate = quantity * dividend.valuePerShare;
        const payment = dividend.paymentDate
          ? `pagamento em ${formatDateOnly(dividend.paymentDate)}`
          : "data de pagamento ainda não divulgada";

        const title = `${asset.ticker} declarou provento`;
        const message =
          `${dividend.type} de ${formatCurrency(dividend.valuePerShare)} por cota · ` +
          `data-com ${formatDateOnly(dividend.exDate)} · ${payment}. ` +
          `Com ${quantity} cotas você deve receber ${formatCurrency(estimate)}.`;

        await notificationRepository.create(holder.userId, title, message);
        notified++;

        if (holder.user.email && holder.user.emailNotifications) {
          try {
            await sendEmail({
              to: holder.user.email,
              subject: `InvestHub — ${asset.ticker} declarou provento`,
              html: alertEmailTemplate(
                message,
                `${process.env.APP_URL}/dividends`,
                asset.ticker,
              ),
            });
          } catch (error) {
            logger.error("Falha ao enviar e-mail de provento declarado", {
              ticker: asset.ticker,
              error: (error as Error).message,
            });
          }
        }
      }
    }

    return notified;
  },

  /**
   * Credita os proventos pagos na data de referência: grava o recibo e avisa o usuário.
   *
   * A quantidade vem do ledger na data-com, não da posição atual — quem vendeu depois da
   * data-com recebe assim mesmo, e quem comprou depois não recebe. O recibo é único por
   * usuário e provento, o que torna a rotina segura de repetir no mesmo dia.
   */
  async notifyPayments(reference = new Date()): Promise<number> {
    const day = toUtcDateOnly(reference);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);

    const dividends = await assetDividendRepository.findPayableBetween(day, nextDay);
    if (dividends.length === 0) return 0;

    const assetIds = [...new Set(dividends.map((dividend) => dividend.assetId))];
    const holders = await positionRepository.findHoldersOfAssets(assetIds);
    // Também precisamos de quem já zerou a posição depois da data-com.
    const pastHolders = await prisma.transaction.findMany({
      where: { assetId: { in: assetIds } },
      select: { userId: true },
      distinct: ["userId"],
    });

    const userIds = [...new Set([...holders.map((h) => h.userId), ...pastHolders.map((t) => t.userId)])];
    if (userIds.length === 0) return 0;

    const transactions = await transactionRepository.findLedgerForAssets(userIds, assetIds);
    const ledgerByUser = new Map<string, LedgerEntry[]>();
    for (const transaction of transactions) {
      const entries = ledgerByUser.get(transaction.userId) ?? [];
      entries.push({
        assetId: transaction.assetId,
        type: transaction.type,
        quantity: Number(transaction.quantity),
        price: Number(transaction.price),
        fees: Number(transaction.fees),
        date: transaction.date,
      });
      ledgerByUser.set(transaction.userId, entries);
    }

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, emailNotifications: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));

    let credited = 0;

    for (const dividend of dividends) {
      const valuePerShare = Number(dividend.valuePerShare);

      for (const userId of userIds) {
        const ledger = ledgerByUser.get(userId) ?? [];
        const quantity = quantityAt(ledger, dividend.assetId, dividend.exDate);
        if (quantity <= 0) continue;

        const total = quantity * valuePerShare;
        const isNew = await dividendReceiptRepository.createIfMissing(
          userId,
          dividend.id,
          quantity,
          total,
        );
        if (!isNew) continue;

        const message =
          `${formatCurrency(total)} de ${dividend.asset.ticker} (${dividend.type}) — ` +
          `${formatCurrency(valuePerShare)} por cota sobre ${quantity} cotas, ` +
          `data-com ${formatDateOnly(dividend.exDate)}.`;

        await notificationRepository.create(
          userId,
          `Provento recebido: ${dividend.asset.ticker}`,
          message,
        );
        credited++;

        const user = userById.get(userId);
        if (user?.email && user.emailNotifications) {
          try {
            await sendEmail({
              to: user.email,
              subject: `InvestHub — provento de ${dividend.asset.ticker} na conta`,
              html: alertEmailTemplate(
                message,
                `${process.env.APP_URL}/dividends`,
                dividend.asset.ticker,
              ),
            });
          } catch (error) {
            logger.error("Falha ao enviar e-mail de provento recebido", {
              ticker: dividend.asset.ticker,
              error: (error as Error).message,
            });
          }
        }
      }
    }

    logger.info("Proventos creditados", { dividends: dividends.length, credited });
    return credited;
  },
};
