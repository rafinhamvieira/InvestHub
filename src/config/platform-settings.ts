/**
 * Parâmetros da plataforma ajustáveis pelo painel.
 *
 * O registro é a fonte única: chave, rótulo, unidade, padrão e **limites**. A tabela no
 * banco guarda apenas a diferença — só existe linha para o que foi mudado, e apagar a linha
 * devolve o padrão.
 *
 * Os limites são a parte que importa. Um campo livre num painel de configuração é um pé de
 * cabra: `FUNDAMENTALS_PER_CYCLE` em 500 estoura a cota diária do provedor em uma rodada e
 * cega o screener por 24 horas; `STEP_UP_TTL_SECONDS` em um dia transforma a confirmação de
 * senha em teatro. Cada faixa abaixo tem um porquê, e ele está escrito.
 *
 * **O que não está aqui é deliberado.** Segredos e URLs de conexão continuam só no `.env`,
 * onde uma edição errada não chega pela internet. E parâmetros de *outros containers* — o
 * intervalo do agendador, a retenção do backup — não podem ser mudados daqui, porque a
 * aplicação não os lê; a tela diz isso em vez de oferecer um controle que não funciona.
 */

export const PLATFORM_SETTING_KEYS = [
  "fundamentalsPerCycle",
  "dividendsPerCycle",
  "syncFailureThreshold",
  "syncStaleHours",
  "unverifiedAccountTtlHours",
  "stepUpTtlSeconds",
] as const;

export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[number];

export interface PlatformSettingSpec {
  key: PlatformSettingKey;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  /** Valor quando não há linha no banco: o do ambiente, ou o de código. */
  fallback: number;
}

function fromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const PLATFORM_SETTINGS: Record<PlatformSettingKey, PlatformSettingSpec> = {
  fundamentalsPerCycle: {
    key: "fundamentalsPerCycle",
    label: "Fundamentos por ciclo",
    description:
      "Quantos ativos têm os indicadores atualizados a cada sincronização. O plano gratuito do provedor dá 200 requisições por dia; com ciclo de 30 minutos, 4 por rodada consomem ~192. Aumentar sem plano maior esgota a cota antes do fim do dia.",
    unit: "ativos",
    min: 0,
    // 20 por ciclo já seriam ~960/dia. Acima disso, nenhum plano gratuito sobrevive, e quem
    // assinou um pago vai querer mexer no código junto com o resto da estratégia de cota.
    max: 20,
    fallback: fromEnv("FUNDAMENTALS_PER_CYCLE", 4),
  },
  dividendsPerCycle: {
    key: "dividendsPerCycle",
    label: "Proventos por ciclo",
    description:
      "Quantos ativos têm os proventos importados por rodada, fora os que alguém acompanha. As fontes são gratuitas, então o limite aqui é educação com quem hospeda os dados.",
    unit: "ativos",
    min: 0,
    max: 50,
    fallback: fromEnv("DIVIDENDS_PER_CYCLE", 10),
  },
  syncFailureThreshold: {
    key: "syncFailureThreshold",
    label: "Falhas até avisar",
    description:
      "Quantas falhas seguidas da sincronização disparam aviso aos administradores. Uma falha isolada é ruído de rede; o valor 1 transforma o aviso em spam e ensina a ignorá-lo.",
    unit: "falhas",
    min: 1,
    max: 20,
    fallback: fromEnv("SYNC_FAILURE_THRESHOLD", 3),
  },
  syncStaleHours: {
    key: "syncStaleHours",
    label: "Horas até considerar parada",
    description:
      "Sem nenhum sucesso por este tempo, a sincronização é dada como parada e o painel a marca em vermelho. Precisa ser maior que o intervalo do agendador, senão acusa parada a cada ciclo.",
    unit: "horas",
    min: 1,
    max: 72,
    fallback: fromEnv("SYNC_STALE_HOURS", 3),
  },
  unverifiedAccountTtlHours: {
    key: "unverifiedAccountTtlHours",
    label: "Prazo para confirmar o e-mail",
    description:
      "Cadastros que não confirmam o e-mail neste prazo são removidos automaticamente. Curto demais apaga quem só demorou a abrir a caixa de entrada.",
    unit: "horas",
    min: 1,
    max: 720,
    fallback: fromEnv("UNVERIFIED_ACCOUNT_TTL_HOURS", 24),
  },
  stepUpTtlSeconds: {
    key: "stepUpTtlSeconds",
    label: "Validade da confirmação de senha",
    description:
      "Por quanto tempo a confirmação de identidade do administrador continua valendo para ações críticas. É o parâmetro mais sensível desta lista: janela longa aproxima o painel de não ter step-up nenhum.",
    unit: "segundos",
    min: 60,
    // Uma hora é o teto. Além disso, um token roubado no começo do expediente valeria pelo
    // dia inteiro — que é exatamente o cenário contra o qual o step-up existe.
    max: 3600,
    fallback: fromEnv("STEP_UP_TTL_SECONDS", 600),
  },
};

export function isPlatformSettingKey(value: string): value is PlatformSettingKey {
  return (PLATFORM_SETTING_KEYS as readonly string[]).includes(value);
}

export interface SettingViolation {
  reason: "UNKNOWN_KEY" | "NOT_INTEGER" | "OUT_OF_RANGE";
  message: string;
}

/**
 * Valida um valor contra o registro. Devolve `null` quando está bom.
 *
 * Pura e testada: é a única coisa entre um campo de texto no navegador e um parâmetro que
 * governa cota de API e janela de segurança.
 */
export function validateSetting(key: string, value: number): SettingViolation | null {
  if (!isPlatformSettingKey(key)) {
    return { reason: "UNKNOWN_KEY", message: `"${key}" não é um parâmetro conhecido.` };
  }

  if (!Number.isInteger(value)) {
    return { reason: "NOT_INTEGER", message: "O valor precisa ser um número inteiro." };
  }

  const spec = PLATFORM_SETTINGS[key];
  if (value < spec.min || value > spec.max) {
    return {
      reason: "OUT_OF_RANGE",
      message: `${spec.label} aceita de ${spec.min} a ${spec.max} ${spec.unit}.`,
    };
  }

  return null;
}
