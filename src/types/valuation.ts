export type MethodVerdict = "BUY" | "WAIT" | "OVERVALUED" | "NO_DATA";

export interface MethodResult {
  method: "GRAHAM" | "BAZIN" | "LYNCH" | "DCF" | "CUSTOM";
  label: string;
  /** Preço justo calculado; null quando faltam dados. */
  fairPrice: number | null;
  /** Preço teto (fair × (1 - margem desejada) quando aplicável). */
  ceilingPrice: number | null;
  /** Margem de segurança atual vs preço justo (fração). */
  margin: number | null;
  verdict: MethodVerdict;
  /** Premissas usadas, para exibição ("DY mínimo 6%", "g=5%, r=12%"...). */
  assumptions: string;
}

export interface GreenblattResult {
  earningsYield: number | null;
  roic: number | null;
  /** Posição no ranking Magic Formula do universo com dados (1 = melhor). */
  rank: number | null;
  universeSize: number;
}

export interface ValuationSummary {
  ticker: string;
  name: string;
  price: number | null;
  methods: MethodResult[];
  greenblatt: GreenblattResult;
  /** Média das margens dos métodos disponíveis. */
  averageMargin: number | null;
  /** Veredito geral derivado da margem média. */
  overallVerdict: MethodVerdict;
  /** Margem desejada usada nos vereditos (fração). */
  desiredMargin: number;
  hasFundamentals: boolean;
}
