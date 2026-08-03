/**
 * Arquivo de backup como a tela o enxerga.
 *
 * Mora em `types/` e não junto do serviço porque o componente de tela precisa dele — e o
 * serviço importa `child_process` e `fs`. Enquanto for `import type` a distinção some na
 * compilação, mas basta alguém apagar a palavra `type` para o build do navegador quebrar.
 */
export interface BackupFile {
  name: string;
  sizeBytes: number;
  /** ISO. */
  createdAt: string;
}

/**
 * Números do painel — tamanho do cadastro e cobertura dos dados de mercado.
 *
 * **Não existe aqui nada de carteira.** Patrimônio, transações, proventos e renda fixa
 * ficaram de fora por decisão do dono do projeto: a promessa ao usuário é que ninguém
 * enxerga a carteira alheia, e um total agregado ainda é feito do dinheiro de pessoas que
 * não autorizaram ninguém a somá-lo. A regra vale para o número, não só para a linha.
 */
export interface BusinessMetrics {
  users: {
    total: number;
    /** Com sessão vista nos últimos 30 dias. */
    active30d: number;
    new7d: number;
    new30d: number;
    /** Cadastrados que nunca confirmaram o e-mail. */
    unverified: number;
    twoFactor: number;
    /** Contas com algum cargo administrativo. */
    staff: number;
  };
  coverage: {
    activeAssets: number;
    withFundamentals: number;
    withDividends: number;
    /** Fração de 0 a 1 — o avanço da rotação limitada pela cota do provedor. */
    fundamentalsRatio: number;
  };
  /** ISO. Momento em que os números foram apurados (podem vir de cache curto). */
  generatedAt: string;
}

/**
 * `warn` é o estado que mais importa aqui: o sistema responde, mas alguma coisa vai parar
 * de funcionar se ninguém agir — backup velho, cota estourada, chave de auditoria ausente.
 */
export type HealthStatus = "ok" | "warn" | "down";

export interface HealthCheck {
  key: string;
  label: string;
  status: HealthStatus;
  /** Frase curta que explica o estado em português, já pronta para a tela. */
  detail: string;
  /** Presente só nas verificações que medem tempo de resposta. */
  latencyMs?: number;
}

export interface HealthSummary {
  /** Pior estado entre as verificações. */
  status: HealthStatus;
  checks: HealthCheck[];
  /** Segundos desde que este processo subiu. */
  uptimeSeconds: number;
  generatedAt: string;
}

export interface AdminDashboard {
  /** Nulo quando o cargo não tem `VIEW_BUSINESS_METRICS`. */
  metrics: BusinessMetrics | null;
  health: HealthSummary;
}
