/**
 * Renda fixa: cadastro do título e conversão da curva em preço.
 *
 * O sistema inteiro pensa em "quantidade × preço". Para não abrir exceção em cada tela,
 * um título de renda fixa vira um ativo com **valor unitário sintético**: 1,00 na emissão,
 * corrigido pelo indexador daí em diante. A compra de R$ 5.000 num CDB emitido há um ano
 * vira `quantidade = 5000 / valor unitário de hoje`, e posição, patrimônio, evolução e
 * alocação continuam funcionando sem saber a diferença.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendEmail, alertEmailTemplate } from "@/lib/email";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { fixedIncomeRepository } from "@/repositories/fixed-income.repository";
import { notificationRepository } from "@/repositories/notification.repository";
import { positionRepository } from "@/repositories/position.repository";
import { BcbProvider } from "@/services/market-data/bcb.provider";
import { unitValueAt, type FixedIncomeCurve, type Indexer } from "@/utils/fixed-income-math";
import { formatCurrency } from "@/utils/format";
import { formatDateOnly, toUtcDateOnly } from "@/utils/date";
import type { AssetType, FixedIncomeIndexer } from "@prisma/client";

export interface FixedIncomeInput {
  /** Nome exibido: "CDB Banco Inter 110% CDI 2028". */
  name: string;
  assetType: Extract<AssetType, "TREASURY" | "FIXED_INCOME">;
  issuer: string | null;
  indexer: FixedIncomeIndexer;
  indexPercent: number | null;
  spreadPercent: number | null;
  maturityDate: Date | null;
}

const bcb = new BcbProvider();

/** Quantos dias antes do vencimento o usuário é avisado (0 = no dia). */
const MATURITY_NOTICE_DAYS = [30, 7, 0];

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Identificador estável do título.
 *
 * Precisa ser determinístico para que a segunda compra do mesmo papel caia no mesmo ativo,
 * e precisa distinguir contratos diferentes do mesmo emissor — dois CDBs do mesmo banco com
 * taxas diferentes são papéis distintos. Daí o hash das condições no fim.
 */
export function buildFixedIncomeTicker(input: FixedIncomeInput): string {
  const fingerprint = [
    input.assetType,
    input.issuer ?? "",
    input.indexer,
    input.indexPercent ?? "",
    input.spreadPercent ?? "",
    input.maturityDate?.toISOString().slice(0, 10) ?? "",
  ].join("|");

  const hash = createHash("sha1").update(fingerprint).digest("hex").slice(0, 5).toUpperCase();
  const base = slugify(input.name).slice(0, 22).replace(/-$/, "");
  return `${base}-${hash}`;
}

export const fixedIncomeService = {
  /**
   * Encontra ou cria o ativo do título, com as condições anexadas.
   * `startDate` é a data da primeira compra conhecida — o marco da curva.
   */
  async registerInstrument(input: FixedIncomeInput, firstDate: Date) {
    const ticker = buildFixedIncomeTicker(input);
    const startDate = toUtcDateOnly(firstDate);

    const asset = await prisma.asset.upsert({
      where: { ticker },
      update: { name: input.name },
      create: { ticker, name: input.name, type: input.assetType },
    });

    await fixedIncomeRepository.upsert(asset.id, {
      issuer: input.issuer,
      indexer: input.indexer,
      indexPercent: input.indexPercent,
      spreadPercent: input.spreadPercent,
      startDate,
      maturityDate: input.maturityDate,
    });
    // Compra retroativa recua o início da curva; sem isso o papel renderia do nada.
    await fixedIncomeRepository.ensureStartDate(asset.id, startDate);

    return asset;
  },

  /** Curva do indexador a partir de uma data, pronta para o cálculo. */
  async loadCurve(indexer: Indexer, since: Date): Promise<FixedIncomeCurve> {
    if (indexer === "PREFIXADO") return { daily: [], monthlyIpca: [] };
    if (indexer === "IPCA") return { daily: [], monthlyIpca: await bcb.getIpcaRates(since) };
    return { daily: await bcb.getDailyRates(indexer, since), monthlyIpca: [] };
  },

  /** Valor unitário do título numa data — 1,00 na emissão. */
  async getUnitValue(assetId: string, at: Date): Promise<number> {
    const terms = await fixedIncomeRepository.findByAsset(assetId);
    if (!terms) return 1;

    const curve = await this.loadCurve(terms.indexer, terms.startDate);
    return unitValueAt(
      {
        indexer: terms.indexer,
        indexPercent: terms.indexPercent === null ? null : Number(terms.indexPercent),
        spreadPercent: terms.spreadPercent === null ? null : Number(terms.spreadPercent),
        startDate: terms.startDate,
      },
      curve,
      at,
    );
  },

  /**
   * Avisa quem tem o título antes e no dia do vencimento.
   *
   * Um papel vencido para de render e vira caixa na corretora, mas continua na carteira até
   * alguém dar baixa. Sem aviso, o patrimônio passa a mentir em silêncio conforme os CDBs
   * vencem — e o dinheiro fica parado sem ninguém lembrar de reinvestir.
   *
   * A baixa em si não é automática: o resgate é decisão do usuário (pode ter havido
   * renovação, portabilidade, resgate antecipado) e o sistema não inventa transação no
   * ledger de ninguém.
   */
  async notifyMaturities(reference = new Date()): Promise<number> {
    const today = toUtcDateOnly(reference);
    const instruments = await fixedIncomeRepository.listAll();
    let notified = 0;

    for (const terms of instruments) {
      if (!terms.maturityDate) continue;

      const daysLeft = Math.round(
        (toUtcDateOnly(terms.maturityDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (!MATURITY_NOTICE_DAYS.includes(daysLeft)) continue;

      const holders = await positionRepository.findHoldersOfAssets([terms.assetId]);
      if (holders.length === 0) continue;

      const unitValue = await this.getUnitValue(terms.assetId, terms.maturityDate);

      for (const holder of holders) {
        const total = Number(holder.quantity) * unitValue;
        const title =
          daysLeft === 0
            ? `${terms.asset.name} venceu`
            : `${terms.asset.name} vence em ${daysLeft} dias`;
        const message =
          daysLeft === 0
            ? `O título venceu hoje e parou de render. Valor no vencimento: ${formatCurrency(total)}. ` +
              "Registre o resgate na carteira para tirar o papel da posição."
            : `Vencimento em ${formatDateOnly(terms.maturityDate)}. ` +
              `Valor estimado no vencimento: ${formatCurrency(total)}.`;

        await notificationRepository.create(holder.userId, title, message);
        notified++;

        if (holder.user.email && holder.user.emailNotifications) {
          try {
            await sendEmail({
              to: holder.user.email,
              subject: `InvestHub — ${title}`,
              html: alertEmailTemplate(message, `${process.env.APP_URL}/portfolio`, terms.asset.ticker),
            });
          } catch (error) {
            logger.error("Falha ao enviar e-mail de vencimento", {
              ticker: terms.asset.ticker,
              error: (error as Error).message,
            });
          }
        }
      }
    }

    return notified;
  },

  /**
   * Grava o valor unitário de hoje de todos os títulos como se fosse cotação.
   *
   * É o que faz a renda fixa render sozinha nas telas: o resto do sistema lê `AssetPrice`
   * sem se importar se o número veio da bolsa ou da curva do CDI. Títulos vencidos param
   * de ser corrigidos — o valor congela no vencimento, que é quando o dinheiro sai do papel.
   */
  async syncPrices(reference = new Date()): Promise<number> {
    const instruments = await fixedIncomeRepository.listAll();
    if (instruments.length === 0) return 0;

    const today = toUtcDateOnly(reference);
    let updated = 0;

    for (const terms of instruments) {
      try {
        const at = terms.maturityDate && terms.maturityDate < today ? terms.maturityDate : today;
        const curve = await this.loadCurve(terms.indexer, terms.startDate);
        const value = unitValueAt(
          {
            indexer: terms.indexer,
            indexPercent: terms.indexPercent === null ? null : Number(terms.indexPercent),
            spreadPercent: terms.spreadPercent === null ? null : Number(terms.spreadPercent),
            startDate: terms.startDate,
          },
          curve,
          at,
        );

        await assetPriceRepository.upsertDaily(terms.assetId, today, { close: value });
        updated++;
      } catch (error) {
        logger.warn("Falha ao atualizar valor de título de renda fixa", {
          ticker: terms.asset.ticker,
          error: (error as Error).message,
        });
      }
    }

    logger.info("Renda fixa atualizada", { instruments: instruments.length, updated });
    return updated;
  },
};
