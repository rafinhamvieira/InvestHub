import { alertRepository } from "@/repositories/alert.repository";
import { notificationRepository } from "@/repositories/notification.repository";
import { assetRepository } from "@/repositories/asset.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { assetFundamentalRepository } from "@/repositories/asset-fundamental.repository";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { checkAlertCondition, describeAlert, type AlertMarketData } from "@/utils/alert-conditions";
import { grahamFairPrice, bazinCeilingPrice, lpaFromPl, vpaFromPvp, safetyMargin } from "@/utils/valuation-math";
import type { AlertInput } from "@/schemas/alert.schema";

export class AlertError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AlertError";
  }
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Margem média simplificada (Graham + Bazin) para o alerta de preço justo. */
function quickAverageMargin(
  price: number | null,
  pl: number | null,
  pvp: number | null,
  dyPercent: number | null,
): number | null {
  if (price === null || price <= 0) return null;

  const margins: number[] = [];

  if (pl !== null && pvp !== null) {
    const lpa = lpaFromPl(price, pl);
    const vpa = vpaFromPvp(price, pvp);
    if (lpa !== null && vpa !== null) {
      const fair = grahamFairPrice(lpa, vpa);
      if (fair !== null) {
        const margin = safetyMargin(price, fair);
        if (margin !== null) margins.push(margin);
      }
    }
  }

  if (dyPercent !== null) {
    const ceiling = bazinCeilingPrice((dyPercent / 100) * price);
    if (ceiling !== null) {
      const margin = safetyMargin(price, ceiling);
      if (margin !== null) margins.push(margin);
    }
  }

  return margins.length > 0 ? margins.reduce((s, m) => s + m, 0) / margins.length : null;
}

export const alertService = {
  async create(userId: string, input: AlertInput): Promise<void> {
    const asset = await assetRepository.findByTicker(input.ticker);
    if (!asset) throw new AlertError("NOT_FOUND", "Ativo não encontrado.");
    await alertRepository.create(userId, asset.id, input.type, input.targetValue, input.channel);
  },

  list(userId: string) {
    return alertRepository.listByUser(userId);
  },

  async setStatus(userId: string, alertId: string, active: boolean): Promise<void> {
    const alert = await alertRepository.findByIdAndUser(alertId, userId);
    if (!alert) throw new AlertError("NOT_FOUND", "Alerta não encontrado.");
    await alertRepository.updateStatus(alertId, active ? "ACTIVE" : "DISABLED");
  },

  async delete(userId: string, alertId: string): Promise<void> {
    const alert = await alertRepository.findByIdAndUser(alertId, userId);
    if (!alert) throw new AlertError("NOT_FOUND", "Alerta não encontrado.");
    await alertRepository.delete(alertId);
  },

  /**
   * Avalia alertas ativos (de um usuário ou de todos) e dispara os satisfeitos:
   * marca TRIGGERED, cria notificação in-app e envia e-mail quando o canal exigir.
   * Retorna quantos alertas dispararam.
   */
  async evaluate(userId?: string): Promise<number> {
    const alerts = await alertRepository.listActive(userId);
    if (alerts.length === 0) return 0;

    const assetIds = [...new Set(alerts.map((a) => a.assetId))];
    const [prices, fundamentals] = await Promise.all([
      assetPriceRepository.findLatestByAssetIds(assetIds),
      assetFundamentalRepository.findLatestByAssetIds(assetIds),
    ]);
    const priceMap = new Map(prices.map((p) => [p.assetId, Number(p.close)]));
    const fundamentalMap = new Map(fundamentals.map((f) => [f.assetId, f]));

    // Proventos recentes por ativo (para NEW_DIVIDEND_DECLARED).
    const recentDividends = await prisma.assetDividend.findMany({
      where: { assetId: { in: assetIds } },
      select: { assetId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const latestDividendAt = new Map<string, Date>();
    for (const d of recentDividends) {
      if (!latestDividendAt.has(d.assetId)) latestDividendAt.set(d.assetId, d.createdAt);
    }

    let triggered = 0;

    for (const alert of alerts) {
      const f = fundamentalMap.get(alert.assetId);
      const price = priceMap.get(alert.assetId) ?? num(f?.price);
      const pl = num(f?.pl);
      const pvp = num(f?.pvp);
      const dy = num(f?.dividendYield);

      const data: AlertMarketData = {
        price,
        dividendYield: dy,
        pl,
        averageMargin: quickAverageMargin(price, pl, pvp, dy),
        hasNewDividend: (latestDividendAt.get(alert.assetId) ?? new Date(0)) > alert.updatedAt,
      };

      const satisfied = checkAlertCondition(alert.type, Number(alert.targetValue), data);
      if (satisfied !== true) continue;

      const message = describeAlert(alert.type, Number(alert.targetValue), alert.asset.ticker);

      await alertRepository.updateStatus(alert.id, "TRIGGERED", new Date());
      await notificationRepository.create(
        alert.userId,
        `Alerta: ${alert.asset.ticker}`,
        message,
        alert.id,
      );

      // E-mail só sai se o alerta pedir E o usuário não tiver desligado nas preferências.
      if (alert.channel === "EMAIL" && alert.user.email && alert.user.emailNotifications) {
        try {
          await sendEmail({
            to: alert.user.email,
            subject: `InvestHub — Alerta ${alert.asset.ticker}`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;"><h2>Alerta disparado</h2><p>${message}</p><p><a href="${process.env.APP_URL}/asset/${alert.asset.ticker}">Ver ativo</a></p></div>`,
          });
        } catch (error) {
          logger.error("Falha ao enviar e-mail de alerta", {
            alertId: alert.id,
            error: (error as Error).message,
          });
        }
      }

      triggered++;
    }

    return triggered;
  },
};
