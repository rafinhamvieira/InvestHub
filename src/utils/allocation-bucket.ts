/**
 * Rótulo do agrupamento "por setor" da carteira.
 *
 * Setor é um conceito de empresa listada. Fundo imobiliário não tem setor — a fonte de
 * dados devolve "Fundos Imobiliários" no campo, o que transforma a carteira inteira de
 * FIIs em uma fatia só e repete o que o gráfico por tipo já mostra. O que separa um FII
 * de outro é o **segmento** (Logística, Papel, Shoppings...), e é ele que entra aqui.
 *
 * Mesma lógica para Tesouro e ETF: não são setores, então ganham um rótulo próprio em
 * vez de cair em "Outros" junto com ações sem classificação.
 */

import type { AssetType } from "@prisma/client";

export interface BucketAsset {
  type: AssetType;
  sector: string | null;
  segment?: string | null;
}

export function sectorBucket(asset: BucketAsset): string {
  switch (asset.type) {
    case "FII":
      return asset.segment?.trim() || "FIIs sem segmento";
    case "TREASURY":
      return "Tesouro Direto";
    case "ETF":
      return "ETFs";
    default:
      return asset.sector?.trim() || "Outros";
  }
}
