/**
 * A brapi devolve o setor na taxonomia em inglês (padrão FactSet/TradingView).
 * Traduzimos para exibir em português na alocação, nos screeners e na tela do ativo.
 *
 * São 20 setores fixos — se aparecer algum fora da lista, mantemos o original em vez
 * de esconder a informação.
 */
export const SECTOR_TRANSLATIONS: Record<string, string> = {
  "Commercial Services": "Serviços Comerciais",
  Communications: "Comunicações",
  "Consumer Durables": "Bens de Consumo Duráveis",
  "Consumer Non-Durables": "Bens de Consumo Não Duráveis",
  "Consumer Services": "Serviços ao Consumidor",
  "Distribution Services": "Distribuição",
  "Electronic Technology": "Tecnologia Eletrônica",
  "Energy Minerals": "Petróleo e Gás",
  Finance: "Financeiro",
  "Health Services": "Serviços de Saúde",
  "Health Technology": "Saúde e Farmacêutico",
  "Industrial Services": "Serviços Industriais",
  Miscellaneous: "Diversos",
  "Non-Energy Minerals": "Mineração e Siderurgia",
  "Process Industries": "Indústria de Processo",
  "Producer Manufacturing": "Bens Industriais",
  "Retail Trade": "Comércio Varejista",
  "Technology Services": "Tecnologia da Informação",
  Transportation: "Transporte e Logística",
  Utilities: "Utilidade Pública",
};

export function translateSector(sector: string | null | undefined): string | null {
  if (!sector) return null;
  return SECTOR_TRANSLATIONS[sector] ?? sector;
}
