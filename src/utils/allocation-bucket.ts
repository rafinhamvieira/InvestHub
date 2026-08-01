/**
 * Rótulo do agrupamento "por setor" da carteira.
 *
 * Setor é um conceito de empresa listada. Fundo imobiliário não tem setor — a fonte de
 * dados devolve "Fundos Imobiliários" no campo, o que transforma a carteira inteira de
 * FIIs em uma fatia só e repete o que o gráfico por tipo já mostra. O que separa um FII
 * de outro é o **segmento** (Logística, Papel, Shoppings...), e é ele que entra aqui.
 *
 * ETF, Tesouro e renda fixa não têm nem setor nem equivalente: um ETF é uma cesta que cruza
 * vários setores e um título não tem setor nenhum. Em vez de inventar uma fatia com o nome
 * da classe — que é exatamente o problema do "Fundos Imobiliários" — eles ficam de fora do
 * gráfico, e o valor correspondente é informado à parte.
 */

import type { AssetType } from "@prisma/client";

export interface BucketAsset {
  type: AssetType;
  sector: string | null;
  segment?: string | null;
}

/** `null` = ativo sem setor possível; não entra no gráfico de setores. */
export function sectorBucket(asset: BucketAsset): string | null {
  switch (asset.type) {
    // Sem segmento sincronizado, não há classificação nenhuma para o fundo — e "FIIs sem
    // segmento" seria de novo o nome de uma classe fingindo ser setor. Fica de fora até o
    // segmento chegar pela sincronização de fundamentos.
    case "FII":
      return asset.segment?.trim() || null;
    case "ETF":
    case "TREASURY":
    case "FIXED_INCOME":
      return null;
    default:
      return asset.sector?.trim() || "Outros";
  }
}
