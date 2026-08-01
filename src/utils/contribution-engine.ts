/**
 * Motor de recomendação de aporte — puro, sem I/O.
 *
 * Duas etapas:
 *
 *  1. **Orçamento por ativo.** Com rebalanceamento, cada ativo recebe uma meta em R$
 *     (fração alvo × patrimônio pós-aporte) e o aporte é repartido proporcionalmente ao
 *     déficit de cada um, nunca acima do próprio déficit. O que sobra por causa de um
 *     teto é redistribuído entre os demais. Sem rebalanceamento, o peso vem da nota dos
 *     critérios de valuation.
 *
 *  2. **Conversão em cotas inteiras**, sem estourar o orçamento. O troco compra unidades
 *     avulsas apenas onde ainda aproxima a carteira da meta. O resto vira saldo restante.
 *
 * A escolha de repartir por déficit — em vez de servir o mais deficitário até o fim — é o
 * que faz o aporte se espalhar pela carteira. Preencher um ativo de cada vez também
 * converge para a meta, mas devolve um plano com um único ticker.
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

/** Rodadas do water-filling — cada uma fecha ao menos um ativo no teto. */
const MAX_ROUNDS = 60;
const EPSILON = 1e-9;
/** Gap de 5 p.p. ou mais recebe pontuação máxima de rebalanceamento. */
const GAP_SATURATION = 0.05;
/** Margem de 30% ou mais recebe pontuação máxima de valuation. */
const MARGIN_SATURATION = 0.3;
/** DY de 12% a.a. ou mais recebe pontuação máxima. */
const DY_SATURATION = 0.12;
/**
 * Sem rebalanceamento, ativos com nota abaixo desta fração da melhor nota ficam de fora.
 * Evita pulverizar o aporte em ativos claramente piores só para distribuir.
 */
const STATIC_SCORE_FLOOR = 0.5;
/** Expoente aplicado à nota estática: distribui, mas favorecendo as melhores notas. */
const STATIC_SCORE_EXPONENT = 3;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Meta individual de cada ativo, em fração do patrimônio.
 *
 * Metas por classe e setor são repartidas entre seus integrantes: sem isso, uma meta de
 * "50% em FIIs" não diz quanto vai para cada FII e o aporte inteiro acaba no ativo que
 * ganhar o desempate. A ordem é do mais específico para o mais genérico — ativo, setor,
 * classe — e cada nível só reparte o que os níveis mais específicos ainda não usaram.
 */
export function resolveAssetTargets(
  assets: EngineAsset[],
  targets: TargetSet,
): Map<string, number> {
  const resolved = new Map<string, number>();

  for (const asset of assets) {
    const explicit = targets.byAsset.get(asset.assetId);
    if (explicit !== undefined) resolved.set(asset.assetId, explicit);
  }

  const spread = (members: EngineAsset[], groupTarget: number) => {
    const pending = members.filter((m) => !resolved.has(m.assetId));
    if (pending.length === 0) return;
    const assigned = members.reduce((sum, m) => sum + (resolved.get(m.assetId) ?? 0), 0);
    const share = Math.max(0, groupTarget - assigned) / pending.length;
    for (const member of pending) resolved.set(member.assetId, share);
  };

  for (const [sector, target] of targets.bySector) {
    spread(
      assets.filter((a) => a.sector === sector),
      target,
    );
  }
  for (const [assetClass, target] of targets.byClass) {
    spread(
      assets.filter((a) => a.assetClass === assetClass),
      target,
    );
  }

  return resolved;
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

function mean(values: Array<number | null>): number {
  const available = values.filter((v): v is number => v !== null);
  return available.length > 0 ? available.reduce((sum, v) => sum + v, 0) / available.length : 0;
}

function usesValuationCriteria(strategy: StrategyConfig): boolean {
  return (
    strategy.belowFair || strategy.belowCeiling || strategy.safetyMargin || strategy.dividendYield
  );
}

/** Nota 0–1 dos critérios de valuation habilitados. `null` = nenhum habilitado. */
function staticScore(criteria: CriterionScores, strategy: StrategyConfig): number | null {
  const enabled: Array<number | null> = [];
  if (strategy.belowFair) enabled.push(criteria.belowFair);
  if (strategy.belowCeiling) enabled.push(criteria.belowCeiling);
  if (strategy.safetyMargin) enabled.push(criteria.safetyMargin);
  if (strategy.dividendYield) enabled.push(criteria.dividendYield);
  return enabled.length > 0 ? mean(enabled) : null;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildReasons(
  asset: EngineAsset,
  gapBefore: number | null,
  deficit: number,
  strategy: StrategyConfig,
): string[] {
  const reasons: string[] = [];

  if (strategy.rebalance && gapBefore !== null) {
    if (gapBefore > 0.001) {
      reasons.push(
        `Está ${(gapBefore * 100).toFixed(1)} p.p. abaixo da meta — faltam ${formatBRL(deficit)}.`,
      );
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

  if (
    usesValuationCriteria(strategy) &&
    !asset.fairPrice &&
    !asset.ceilingPrice &&
    asset.dividendYield === null
  ) {
    reasons.push("Sem dados fundamentais — critérios de valuation ignorados para este ativo.");
  }

  return reasons;
}

export interface ContributionOptions {
  /**
   * Teto de concentração por ativo, como fração do aporte (0,3 = 30%). 1 = sem limite.
   *
   * Rede de proteção para estratégias que não se autoequilibram — com apenas "maior
   * Dividend Yield", por exemplo, nada impede que os melhores pagadores levem quase tudo.
   * Com rebalanceamento o teto raramente aperta, porque a repartição já sai do déficit.
   */
  maxPerAssetFraction?: number;
}

interface Slot {
  asset: EngineAsset;
  /** Peso relativo na divisão do aporte. */
  weight: number;
  /** Meta em fração do patrimônio (null = ativo sem meta). */
  target: number | null;
  /** Quanto falta em R$ para o ativo atingir a meta no patrimônio pós-aporte. */
  deficit: number;
  /** Teto de investimento neste ativo. */
  max: number;
  budget: number;
  quantity: number;
  score: number;
  gapBefore: number | null;
}

/**
 * Reparte `amount` entre os slots proporcionalmente ao peso, respeitando o teto de cada um.
 * O excedente de quem bate no teto volta para a rodada seguinte. Devolve o total repartido.
 */
function waterfill(slots: Slot[], amount: number): number {
  let pool = amount;

  for (let round = 0; round < MAX_ROUNDS && pool > EPSILON; round++) {
    const open = slots.filter((s) => s.weight > 0 && s.budget < s.max - EPSILON);
    const totalWeight = open.reduce((sum, s) => sum + s.weight, 0);
    if (open.length === 0 || totalWeight <= 0) break;

    let used = 0;
    for (const slot of open) {
      const share = (pool * slot.weight) / totalWeight;
      const add = Math.min(share, slot.max - slot.budget);
      slot.budget += add;
      used += add;
    }

    if (used <= EPSILON) break;
    pool -= used;
  }

  return amount - pool;
}

export function buildContributionPlan(
  assets: EngineAsset[],
  targets: TargetSet,
  amount: number,
  strategy: StrategyConfig,
  options: ContributionOptions = {},
): ContributionPlan {
  const warnings: string[] = [];

  const investable = assets.filter((a) => {
    if (a.price > 0) return true;
    warnings.push(`${a.ticker}: sem cotação conhecida — ignorado.`);
    return false;
  });

  const totalBefore = investable.reduce((sum, a) => sum + a.currentValue, 0);
  const totalAfter = totalBefore + amount;
  const assetTargets = resolveAssetTargets(investable, targets);
  const hasTargets = assetTargets.size > 0;

  // Rebalanceamento só dirige a divisão se houver alguma meta; sem metas, cai nos
  // critérios de valuation (e, se nem esses existirem, não há plano a montar).
  const rebalanceDriven = strategy.rebalance && hasTargets;

  const capFraction = options.maxPerAssetFraction ?? 1;
  const cap = capFraction > 0 && capFraction < 1 ? capFraction * amount : Infinity;

  // ---------- Pesos ----------
  const slots: Slot[] = investable.map((asset) => {
    const criteria: CriterionScores = {
      rebalance: null,
      ...valuationScores(asset),
    };
    const target = assetTargets.get(asset.assetId) ?? null;
    const gapBefore =
      target === null ? null : target - (totalBefore > 0 ? asset.currentValue / totalBefore : 0);
    criteria.rebalance = gapBefore === null ? null : clamp01(gapBefore / GAP_SATURATION);

    const deficit = target === null ? 0 : Math.max(0, target * totalAfter - asset.currentValue);
    const valuation = staticScore(criteria, strategy);

    const scoreParts: Array<number | null> = [];
    if (strategy.rebalance) scoreParts.push(criteria.rebalance);
    if (strategy.belowFair) scoreParts.push(criteria.belowFair);
    if (strategy.belowCeiling) scoreParts.push(criteria.belowCeiling);
    if (strategy.safetyMargin) scoreParts.push(criteria.safetyMargin);
    if (strategy.dividendYield) scoreParts.push(criteria.dividendYield);

    return {
      asset,
      // Peso definitivo é atribuído abaixo, quando se sabe qual modo comanda a divisão.
      weight: rebalanceDriven
        ? // A nota de valuation apenas inclina a divisão (fator 0,5–1,5); quem manda é o déficit.
          deficit * (valuation === null ? 1 : 0.5 + valuation)
        : (valuation ?? 0) ** STATIC_SCORE_EXPONENT,
      target,
      deficit,
      max: rebalanceDriven ? Math.min(cap, deficit) : cap,
      budget: 0,
      quantity: 0,
      score: mean(scoreParts),
      gapBefore,
    };
  });

  // Sem rebalanceamento, corta os ativos muito piores que o melhor da lista.
  if (!rebalanceDriven) {
    const best = slots.reduce((max, s) => Math.max(max, s.weight), 0);
    const floor = best * STATIC_SCORE_FLOOR ** STATIC_SCORE_EXPONENT;
    for (const slot of slots) {
      if (slot.weight < floor) slot.weight = 0;
    }
  }

  // ---------- Orçamento por ativo ----------
  let distributed = waterfill(slots, amount);

  // Se o teto por ativo travou a divisão e sobrou dinheiro, soltamos o limite e avisamos:
  // deixar saldo parado é pior do que exceder a concentração. O limite do déficit continua
  // valendo — passar da meta não é "aproveitar o aporte", é desbalancear de novo.
  const capBinding = cap !== Infinity && slots.some((s) => s.weight > 0 && s.max === cap);
  if (amount - distributed > EPSILON && capBinding) {
    for (const slot of slots) {
      slot.max = rebalanceDriven ? slot.deficit : Infinity;
    }
    const extra = waterfill(slots, amount - distributed);
    if (extra > EPSILON) {
      distributed += extra;
      warnings.push(
        `Não há ativos suficientes para respeitar o limite de ${Math.round(capFraction * 100)}% por ativo; o limite foi flexibilizado para aproveitar o aporte.`,
      );
    }
  }

  // ---------- Cotas inteiras ----------
  let remaining = amount;
  for (const slot of slots) {
    const quantity = Math.floor(slot.budget / slot.asset.price);
    if (quantity <= 0) continue;
    slot.quantity = quantity;
    remaining -= quantity * slot.asset.price;
  }

  // Troco: compra unidades avulsas enquanto elas aproximarem a carteira da meta. Em
  // rebalanceamento, "aproximar" é ter déficit residual de pelo menos meia cota — comprar
  // além disso passaria da meta e desfaria o que o plano acabou de arrumar.
  for (let guard = 0; guard < MAX_ROUNDS * slots.length; guard++) {
    let best: Slot | null = null;
    let bestRank = 0;

    for (const slot of slots) {
      if (slot.weight <= 0 || slot.asset.price > remaining + EPSILON) continue;

      const invested = slot.quantity * slot.asset.price;
      const rank = rebalanceDriven ? slot.deficit - invested : slot.weight;
      if (rebalanceDriven && rank < slot.asset.price / 2) continue;
      if (rank > bestRank || (rank === bestRank && best !== null && slot.asset.price < best.asset.price)) {
        best = slot;
        bestRank = rank;
      }
    }

    if (!best) break;
    best.quantity += 1;
    remaining -= best.asset.price;
  }

  const spent = amount - remaining;
  const finalTotal = totalBefore + spent;
  const bought = slots.filter((s) => s.quantity > 0);

  // ---------- Diagnóstico ----------
  // Sem isso, "nenhuma compra recomendada" não diz o que fazer a seguir — e a causa
  // mais comum (rebalancear sem ter cadastrado metas) é justamente a mais silenciosa.
  let reason: NoPurchaseReason | null = null;
  if (bought.length === 0) {
    const usesValuation = usesValuationCriteria(strategy);
    const cheapest = investable.reduce<number | null>(
      (min, a) => (min === null || a.price < min ? a.price : min),
      null,
    );

    if (assets.length === 0) reason = "NO_ASSETS";
    else if (investable.length === 0) reason = "NO_PRICES";
    else if (cheapest !== null && cheapest > amount) reason = "AMOUNT_TOO_SMALL";
    else if (strategy.rebalance && !hasTargets && !usesValuation) reason = "NO_TARGETS";
    else if (rebalanceDriven && !usesValuation) reason = "ALL_ABOVE_TARGET";
    else reason = "NO_CRITERIA_DATA";
  } else if (rebalanceDriven && remaining > EPSILON) {
    const cheapestOpen = slots
      .filter((s) => s.weight > 0 && s.deficit - s.quantity * s.asset.price >= s.asset.price / 2)
      .reduce<number | null>((min, s) => (min === null || s.asset.price < min ? s.asset.price : min), null);
    if (cheapestOpen === null) {
      warnings.push(
        `Sobraram ${formatBRL(remaining)}: comprar mais passaria das metas dos ativos elegíveis. Guarde para o próximo aporte ou revise as metas.`,
      );
    }
  }

  // ---------- Itens do plano ----------
  const items: PlanItem[] = bought
    .map((slot) => {
      const invested = slot.quantity * slot.asset.price;
      return {
        assetId: slot.asset.assetId,
        ticker: slot.asset.ticker,
        name: slot.asset.name,
        quantity: slot.quantity,
        price: slot.asset.price,
        invested,
        score: Math.round(slot.score * 100),
        reasons: buildReasons(slot.asset, slot.gapBefore, slot.deficit, strategy),
        weightBefore: totalBefore > 0 ? slot.asset.currentValue / totalBefore : 0,
        weightAfter: finalTotal > 0 ? (slot.asset.currentValue + invested) / finalTotal : 0,
        targetWeight: slot.target,
      };
    })
    .sort((a, b) => b.invested - a.invested);

  // ---------- Projeção por classe ----------
  const classValuesBefore = new Map<string, number>();
  const classValuesAfter = new Map<string, number>();
  const classLabels = new Map<string, string>();
  for (const slot of slots) {
    const { assetClass, classLabel, currentValue, price } = slot.asset;
    classLabels.set(assetClass, classLabel);
    classValuesBefore.set(assetClass, (classValuesBefore.get(assetClass) ?? 0) + currentValue);
    classValuesAfter.set(
      assetClass,
      (classValuesAfter.get(assetClass) ?? 0) + currentValue + slot.quantity * price,
    );
  }

  const byClassAfter: ClassProjection[] = [...classValuesAfter.entries()]
    .map(([assetClass, valueAfter]) => ({
      label: classLabels.get(assetClass) ?? assetClass,
      before: totalBefore > 0 ? (classValuesBefore.get(assetClass) ?? 0) / totalBefore : 0,
      after: finalTotal > 0 ? valueAfter / finalTotal : 0,
      target: targets.byClass.get(assetClass) ?? null,
    }))
    .sort((a, b) => b.after - a.after);

  return {
    amount,
    spent,
    leftover: remaining,
    totalBefore,
    totalAfter: finalTotal,
    items,
    byClassAfter,
    warnings,
    reason,
  };
}
