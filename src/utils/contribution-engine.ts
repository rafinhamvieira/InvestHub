/**
 * Motor de recomendação de aporte — puro, sem I/O.
 *
 * Algoritmo: guloso unidade a unidade. A cada iteração compra 1 unidade do ativo
 * com maior prioridade, recalculando os pesos da carteira simulada (o gap de
 * rebalanceamento diminui conforme o ativo é comprado). Garante quantidades
 * inteiras e nunca estoura o orçamento. O que não couber vira saldo restante.
 */

import type {
  StrategyConfig,
  ContributionPlan,
  PlanItem,
  ClassProjection,
  NoPurchaseReason,
} from "@/types/contribution";

export interface EngineAsset {
  assetId: string;
  ticker: string;
  name: string;
  /** Classe (AssetType) e rótulo de exibição. */
  assetClass: string;
  classLabel: string;
  sector: string | null;
  price: number;
  /** Valor atual em carteira (0 se ainda não possui). */
  currentValue: number;
  /** Preço justo (Graham), se calculável. */
  fairPrice: number | null;
  /** Preço teto (Bazin), se calculável. */
  ceilingPrice: number | null;
  /** Dividend Yield anual como fração, se conhecido. */
  dividendYield: number | null;
}

export interface TargetSet {
  /** Frações por assetId. */
  byAsset: Map<string, number>;
  /** Frações por classe (AssetType). */
  byClass: Map<string, number>;
  /** Frações por setor. */
  bySector: Map<string, number>;
}

const MAX_ITERATIONS = 20_000;
/** Gap de 5 p.p. ou mais recebe pontuação máxima de rebalanceamento. */
const GAP_SATURATION = 0.05;
/** Margem de 30% ou mais recebe pontuação máxima de valuation. */
const MARGIN_SATURATION = 0.3;
/** DY de 12% a.a. ou mais recebe pontuação máxima. */
const DY_SATURATION = 0.12;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

interface SimState {
  values: Map<string, number>;
  total: number;
  classOf?: Map<string, string>;
  sectorOf?: Map<string, string | null>;
}

/**
 * Gap combinado de rebalanceamento do ativo (fração, positivo = abaixo da meta).
 * Combina metas de ativo (peso 0.5), classe (0.3) e setor (0.2), renormalizando
 * pelos níveis que possuem meta definida.
 */
function combinedGap(asset: EngineAsset, targets: TargetSet, state: SimState): number | null {
  // Carteira vazia: peso atual de tudo é 0, gap = meta cheia.
  const total = state.total > 0 ? state.total : null;

  const parts: Array<{ weight: number; gap: number }> = [];

  const assetTarget = targets.byAsset.get(asset.assetId);
  if (assetTarget !== undefined) {
    const weight = total ? (state.values.get(asset.assetId) ?? 0) / total : 0;
    parts.push({ weight: 0.5, gap: assetTarget - weight });
  }

  const classTarget = targets.byClass.get(asset.assetClass);
  if (classTarget !== undefined) {
    let classValue = 0;
    for (const [id, value] of state.values) {
      classValue += asset.assetClass === state.classOf?.get(id) ? value : 0;
    }
    parts.push({ weight: 0.3, gap: classTarget - (total ? classValue / total : 0) });
  }

  if (asset.sector) {
    const sectorTarget = targets.bySector.get(asset.sector);
    if (sectorTarget !== undefined) {
      let sectorValue = 0;
      for (const [id, value] of state.values) {
        sectorValue += asset.sector === state.sectorOf?.get(id) ? value : 0;
      }
      parts.push({ weight: 0.2, gap: sectorTarget - (total ? sectorValue / total : 0) });
    }
  }

  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  return parts.reduce((sum, p) => sum + (p.weight / totalWeight) * p.gap, 0);
}

interface CriterionScores {
  rebalance: number | null;
  belowFair: number | null;
  belowCeiling: number | null;
  safetyMargin: number | null;
  dividendYield: number | null;
}

function valuationScores(asset: EngineAsset): Omit<CriterionScores, "rebalance"> {
  const fairMargin =
    asset.fairPrice && asset.fairPrice > 0 ? (asset.fairPrice - asset.price) / asset.fairPrice : null;
  const ceilingMargin =
    asset.ceilingPrice && asset.ceilingPrice > 0
      ? (asset.ceilingPrice - asset.price) / asset.ceilingPrice
      : null;

  return {
    belowFair: fairMargin === null ? null : clamp01(fairMargin / MARGIN_SATURATION),
    belowCeiling: ceilingMargin === null ? null : clamp01(ceilingMargin / MARGIN_SATURATION),
    safetyMargin: fairMargin === null ? null : clamp01(fairMargin / MARGIN_SATURATION),
    dividendYield:
      asset.dividendYield === null ? null : clamp01(asset.dividendYield / DY_SATURATION),
  };
}

/** Score 0–1 combinando os critérios habilitados (média dos disponíveis). */
function combinedScore(
  asset: EngineAsset,
  targets: TargetSet,
  state: SimState,
  strategy: StrategyConfig,
): { score: number; criteria: CriterionScores } {
  const valuation = valuationScores(asset);
  const gap = combinedGap(asset, targets, state);
  const criteria: CriterionScores = {
    rebalance: gap === null ? null : clamp01(gap / GAP_SATURATION),
    ...valuation,
  };

  const enabled: Array<number | null> = [];
  if (strategy.rebalance) enabled.push(criteria.rebalance);
  if (strategy.belowFair) enabled.push(criteria.belowFair);
  if (strategy.belowCeiling) enabled.push(criteria.belowCeiling);
  if (strategy.safetyMargin) enabled.push(criteria.safetyMargin);
  if (strategy.dividendYield) enabled.push(criteria.dividendYield);

  const available = enabled.filter((v): v is number => v !== null);
  const score = available.length > 0 ? available.reduce((s, v) => s + v, 0) / available.length : 0;

  return { score, criteria };
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildReasons(
  asset: EngineAsset,
  criteria: CriterionScores,
  gapBefore: number | null,
  strategy: StrategyConfig,
): string[] {
  const reasons: string[] = [];

  if (strategy.rebalance && gapBefore !== null) {
    if (gapBefore > 0.001) {
      reasons.push(`Está ${(gapBefore * 100).toFixed(1)} p.p. abaixo da meta de alocação.`);
    } else if (gapBefore < -0.001) {
      reasons.push(`Já está ${Math.abs(gapBefore * 100).toFixed(1)} p.p. acima da meta.`);
    } else {
      reasons.push("Alinhado à meta de alocação.");
    }
  }

  if ((strategy.belowFair || strategy.safetyMargin) && asset.fairPrice) {
    const margin = (asset.fairPrice - asset.price) / asset.fairPrice;
    if (margin > 0) {
      reasons.push(
        `Preço ${(margin * 100).toFixed(0)}% abaixo do justo (Graham ${formatBRL(asset.fairPrice)}).`,
      );
    } else {
      reasons.push(`Preço acima do justo (Graham ${formatBRL(asset.fairPrice)}).`);
    }
  }

  if (strategy.belowCeiling && asset.ceilingPrice) {
    reasons.push(
      asset.price <= asset.ceilingPrice
        ? `Abaixo do preço teto Bazin (${formatBRL(asset.ceilingPrice)}).`
        : `Acima do preço teto Bazin (${formatBRL(asset.ceilingPrice)}).`,
    );
  }

  if (strategy.dividendYield && asset.dividendYield !== null) {
    reasons.push(`Dividend Yield de ${(asset.dividendYield * 100).toFixed(1)}% a.a.`);
  }

  const usesValuation =
    strategy.belowFair || strategy.belowCeiling || strategy.safetyMargin || strategy.dividendYield;
  if (
    usesValuation &&
    !asset.fairPrice &&
    !asset.ceilingPrice &&
    asset.dividendYield === null
  ) {
    reasons.push("Sem dados fundamentais — critérios de valuation ignorados para este ativo.");
  }

  return reasons;
}

export function buildContributionPlan(
  assets: EngineAsset[],
  targets: TargetSet,
  amount: number,
  strategy: StrategyConfig,
): ContributionPlan {
  const warnings: string[] = [];

  const investable = assets.filter((a) => {
    if (a.price > 0) return true;
    warnings.push(`${a.ticker}: sem cotação conhecida — ignorado.`);
    return false;
  });

  const classOf = new Map(investable.map((a) => [a.assetId, a.assetClass]));
  const sectorOf = new Map(investable.map((a) => [a.assetId, a.sector]));
  const totalBefore = investable.reduce((sum, a) => sum + a.currentValue, 0);

  const initialState: SimState = {
    values: new Map(investable.map((a) => [a.assetId, a.currentValue])),
    total: totalBefore,
    classOf,
    sectorOf,
  };

  // Score/gap "antes do aporte" para exibição e explicações.
  const displayState: SimState = { ...initialState, total: Math.max(totalBefore, 1e-9) };
  const initialInfo = new Map(
    investable.map((a) => {
      const { score, criteria } = combinedScore(a, targets, displayState, strategy);
      const gap = combinedGap(a, targets, displayState);
      return [a.assetId, { score, criteria, gap }];
    }),
  );

  // ---------- Loop guloso ----------
  // Os gaps são medidos contra o total FINAL (patrimônio + aporte): é o alvo que a
  // carteira terá após investir tudo, padrão de rebalanceamento por aporte. Assim o
  // motor continua comprando até cada grupo atingir sua fração do total final.
  const state: SimState = {
    values: new Map(initialState.values),
    total: totalBefore + amount,
    classOf,
    sectorOf,
  };
  const quantities = new Map<string, number>();
  let remaining = amount;
  let iterations = 0;

  while (iterations++ < MAX_ITERATIONS) {
    let best: EngineAsset | null = null;
    let bestScore = -Infinity;

    for (const asset of investable) {
      if (asset.price > remaining) continue;
      const { score } = combinedScore(asset, targets, state, strategy);
      if (
        score > bestScore ||
        (score === bestScore && best !== null && asset.price < best.price)
      ) {
        best = asset;
        bestScore = score;
      }
    }

    if (!best || bestScore <= 0) break;

    quantities.set(best.assetId, (quantities.get(best.assetId) ?? 0) + 1);
    state.values.set(best.assetId, (state.values.get(best.assetId) ?? 0) + best.price);
    remaining -= best.price;
  }

  const spent = amount - remaining;
  const totalAfter = totalBefore + spent;

  // ---------- Diagnóstico ----------
  // Sem isso, "nenhuma compra recomendada" não diz o que fazer a seguir — e a causa
  // mais comum (rebalancear sem ter cadastrado metas) é justamente a mais silenciosa.
  let reason: NoPurchaseReason | null = null;
  if (quantities.size === 0) {
    const hasTargets =
      targets.byAsset.size > 0 || targets.byClass.size > 0 || targets.bySector.size > 0;
    const usesValuation =
      strategy.belowFair || strategy.belowCeiling || strategy.safetyMargin || strategy.dividendYield;
    const cheapest = investable.reduce<number | null>(
      (min, a) => (min === null || a.price < min ? a.price : min),
      null,
    );

    if (assets.length === 0) reason = "NO_ASSETS";
    else if (investable.length === 0) reason = "NO_PRICES";
    else if (cheapest !== null && cheapest > amount) reason = "AMOUNT_TOO_SMALL";
    else if (strategy.rebalance && !hasTargets && !usesValuation) reason = "NO_TARGETS";
    else if (strategy.rebalance && hasTargets && !usesValuation) reason = "ALL_ABOVE_TARGET";
    else reason = "NO_CRITERIA_DATA";
  }

  // ---------- Itens do plano ----------
  const items: PlanItem[] = [...quantities.entries()]
    .map(([assetId, quantity]) => {
      const asset = investable.find((a) => a.assetId === assetId)!;
      const info = initialInfo.get(assetId);
      const invested = quantity * asset.price;
      const before = totalBefore > 0 ? asset.currentValue / totalBefore : 0;
      const after = totalAfter > 0 ? (asset.currentValue + invested) / totalAfter : 0;

      return {
        assetId,
        ticker: asset.ticker,
        name: asset.name,
        quantity,
        price: asset.price,
        invested,
        score: Math.round((info?.score ?? 0) * 100),
        reasons: buildReasons(asset, info?.criteria ?? ({} as CriterionScores), info?.gap ?? null, strategy),
        weightBefore: before,
        weightAfter: after,
      };
    })
    .sort((a, b) => b.invested - a.invested);

  // ---------- Projeção por classe ----------
  const classValuesBefore = new Map<string, number>();
  const classValuesAfter = new Map<string, number>();
  const classLabels = new Map<string, string>();
  for (const asset of investable) {
    classLabels.set(asset.assetClass, asset.classLabel);
    classValuesBefore.set(
      asset.assetClass,
      (classValuesBefore.get(asset.assetClass) ?? 0) + asset.currentValue,
    );
    const bought = (quantities.get(asset.assetId) ?? 0) * asset.price;
    classValuesAfter.set(
      asset.assetClass,
      (classValuesAfter.get(asset.assetClass) ?? 0) + asset.currentValue + bought,
    );
  }

  const byClassAfter: ClassProjection[] = [...classValuesAfter.entries()]
    .map(([assetClass, valueAfter]) => ({
      label: classLabels.get(assetClass) ?? assetClass,
      before: totalBefore > 0 ? (classValuesBefore.get(assetClass) ?? 0) / totalBefore : 0,
      after: totalAfter > 0 ? valueAfter / totalAfter : 0,
      target: targets.byClass.get(assetClass) ?? null,
    }))
    .sort((a, b) => b.after - a.after);

  return {
    amount,
    spent,
    leftover: remaining,
    totalBefore,
    totalAfter,
    items,
    byClassAfter,
    warnings,
    reason,
  };
}
