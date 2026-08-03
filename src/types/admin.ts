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
 * Números de negócio do painel — sempre agregados, nunca por pessoa.
 *
 * A tela administrativa mostra o tamanho da operação; quem precisa olhar uma conta
 * específica vai para `/admin/users`, onde a ação fica auditada com autor e motivo.
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
  portfolio: {
    /** Contas com pelo menos uma posição aberta. */
    investors: number;
    /** Soma do custo das posições abertas — o que entrou, não o valor de mercado. */
    totalInvested: number;
    positions: number;
    transactions: number;
    transactions30d: number;
    /** Ativos distintos presentes em alguma carteira. */
    assetsHeld: number;
  };
  dividends: {
    /** Creditado aos usuários nos últimos 12 meses. */
    received12m: number;
    receipts12m: number;
    /** Proventos anunciados a pagar nos próximos 30 dias em ativos que alguém tem. */
    upcoming30d: number;
  };
  fixedIncome: {
    /** Contas com algum título em carteira. */
    holders: number;
    /** Títulos distintos em carteira. */
    titles: number;
    invested: number;
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
