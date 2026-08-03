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

/** Uma tabela no laudo do ensaio: quanto veio no backup, quanto existe hoje. */
export interface RestoreTableCount {
  label: string;
  backup: number;
  current: number;
}

/**
 * Laudo do ensaio de restauração.
 *
 * Backup nunca restaurado não é backup — é um arquivo cuja utilidade ninguém verificou. O
 * ensaio carrega o dump num banco temporário, confere e apaga. A produção não é tocada em
 * nenhum momento.
 */
export interface RestoreDrillReport {
  file: string;
  /** Nome do banco temporário usado e já removido — aparece no laudo para rastreabilidade. */
  database: string;
  durationMs: number;
  tables: RestoreTableCount[];
  /** Registro mais recente da trilha dentro do backup: diz de quando é a cópia. */
  newestAuditAt: string | null;
  /** Verificação da cadeia de hash *dentro do backup*, com o mesmo código da produção. */
  auditChainValid: boolean;
  auditRecords: number;
  /** Último checkpoint do backup cuja assinatura ainda confere com a chave atual. */
  lastValidCheckpointSeq: string | null;
  /** Problemas que pedem atenção humana; vazio quando o ensaio saiu limpo. */
  warnings: string[];
  verifiedAt: string;
}

export type AppLogLevel = "debug" | "info" | "warn" | "error";

/** Uma linha do arquivo de log, já interpretada. */
export interface AppLogEntry {
  /** Estável dentro de uma varredura: arquivo e posição. Serve de chave na tela. */
  id: string;
  level: AppLogLevel;
  message: string;
  timestamp: string;
  /** O que veio junto da chamada — tudo que não é nível, mensagem ou horário. */
  context: Record<string, unknown>;
}

export interface AppLogFilters {
  levels?: AppLogLevel[];
  search?: string;
  /** ISO. */
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface AppLogPage {
  entries: AppLogEntry[];
  /** Quantas linhas casaram **dentro da janela varrida**, não no histórico inteiro. */
  total: number;
  /**
   * Verdadeiro quando a varredura parou no teto de bytes: existe histórico além do que foi
   * lido. A tela diz isso em vez de fingir que aquilo é tudo.
   */
  truncated: boolean;
  page: number;
  pageSize: number;
  /** Nulo quando não há arquivo — sink desligado ou pasta sem permissão de escrita. */
  sizeBytes: number | null;
}

export interface AdminDashboard {
  /** Nulo quando o cargo não tem `VIEW_BUSINESS_METRICS`. */
  metrics: BusinessMetrics | null;
  health: HealthSummary;
}
