/**
 * Regras que traduzem medição em estado de saúde.
 *
 * Vivem separadas dos serviços que fazem as sondagens porque é aqui que mora a decisão —
 * "backup de ontem ainda é aceitável, o de anteontem não" — e decisão precisa de teste. Os
 * serviços só medem; nenhum deles escolhe cor de semáforo.
 *
 * Nenhuma função aqui toca em banco, Redis ou relógio implícito: o instante entra por
 * parâmetro, para que um teste possa fixá-lo.
 */

import type { HealthCheck, HealthStatus } from "@/types/admin";

const HOUR_MS = 60 * 60 * 1000;

/** Pior estado do conjunto — é ele que vai para o topo da tela. */
export function worstStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("down")) return "down";
  if (statuses.includes("warn")) return "warn";
  return "ok";
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / HOUR_MS;
}

/** "há 3 horas", "há 2 dias" — texto de apoio, não unidade de cálculo. */
export function describeAge(hours: number): string {
  if (hours < 1) return `há ${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `há ${Math.round(hours)} h`;
  return `há ${Math.round(hours / 24)} dias`;
}

/**
 * Tempo de resposta de banco e cache.
 *
 * Erro é `down` sem discussão. Lentidão vira `warn` porque banco que responde em segundo é
 * banco que ainda funciona — mas é também o primeiro sintoma de um que vai parar.
 */
export function latencyCheck(
  key: string,
  label: string,
  result: { latencyMs: number; error?: string },
  warnMs: number,
): HealthCheck {
  if (result.error) {
    return { key, label, status: "down", detail: result.error, latencyMs: result.latencyMs };
  }

  return {
    key,
    label,
    status: result.latencyMs > warnMs ? "warn" : "ok",
    detail:
      result.latencyMs > warnMs
        ? `Respondeu em ${result.latencyMs} ms, acima do limite de ${warnMs} ms.`
        : `Respondeu em ${result.latencyMs} ms.`,
    latencyMs: result.latencyMs,
  };
}

export interface SyncSnapshot {
  lastSuccessAt: string | null;
  failures: number;
  /** Horas sem sucesso a partir das quais o job é dado como parado. */
  staleHours: number;
  /** Falhas seguidas que já disparam aviso ao administrador. */
  failureThreshold: number;
}

/**
 * Estado da sincronização de mercado.
 *
 * Duas falhas distintas, na ordem em que doem: **parado** (nenhum sucesso na janela) é pior
 * que **falhando** (erra, mas tenta), e ambos são piores que a ausência de histórico, que
 * acontece de forma legítima depois de um `FLUSHALL` ou de um container recém-subido.
 */
export function syncCheck(snapshot: SyncSnapshot, now: Date): HealthCheck {
  const base = { key: "sync", label: "Sincronização de mercado" };

  if (!snapshot.lastSuccessAt) {
    return {
      ...base,
      status: "warn",
      detail:
        "Nenhuma sincronização registrada. Normal logo após subir o container ou limpar o " +
        "cache; se persistir, verifique o scheduler e o CRON_SECRET.",
    };
  }

  const age = hoursBetween(new Date(snapshot.lastSuccessAt), now);

  if (age > snapshot.staleHours) {
    return {
      ...base,
      ageHours: age,
      status: "down",
      detail: `Último sucesso ${describeAge(age)}, acima das ${snapshot.staleHours} h toleradas. Os preços estão congelados.`,
    };
  }

  if (snapshot.failures >= snapshot.failureThreshold) {
    return {
      ...base,
      ageHours: age,
      status: "warn",
      detail: `${snapshot.failures} falhas seguidas desde o último sucesso, ${describeAge(age)}.`,
    };
  }

  return {
    ...base,
    ageHours: age,
    status: "ok",
    detail:
      snapshot.failures > 0
        ? `Último sucesso ${describeAge(age)}, com ${snapshot.failures} falha(s) desde então.`
        : `Último sucesso ${describeAge(age)}.`,
  };
}

/**
 * Idade do backup mais recente.
 *
 * O serviço automático grava um por dia. Passar de `warnHours` significa que um ciclo já
 * falhou; passar de `downHours`, que a janela de recuperação está aberta há dias.
 */
export function backupCheck(
  newestAt: string | null,
  now: Date,
  { warnHours = 36, downHours = 72 }: { warnHours?: number; downHours?: number } = {},
): HealthCheck {
  const base = { key: "backup", label: "Backup do banco" };

  if (!newestAt) {
    return {
      ...base,
      status: "down",
      detail: "Nenhum backup encontrado. Sem cópia, qualquer perda de dados é definitiva.",
    };
  }

  const age = hoursBetween(new Date(newestAt), now);

  if (age > downHours) {
    return { ...base, ageHours: age, status: "down", detail: `O backup mais recente é de ${describeAge(age)}.` };
  }
  if (age > warnHours) {
    return {
      ...base,
      ageHours: age,
      status: "warn",
      detail: `O backup mais recente é de ${describeAge(age)} — o ciclo diário não rodou.`,
    };
  }

  return { ...base, ageHours: age, status: "ok", detail: `Backup mais recente ${describeAge(age)}.` };
}

export interface AuditSnapshot {
  /** Último evento gravado na trilha. */
  headSeq: bigint | null;
  /** Sequência do último checkpoint assinado. */
  checkpointSeq: bigint | null;
  /** Se a chave de assinatura existe no ambiente. */
  signingConfigured: boolean;
  /** A cada quantos eventos uma âncora deveria ser gravada. */
  checkpointEvery: number;
}

/**
 * Estado das âncoras da auditoria.
 *
 * A cadeia de hash é do banco e não depende de nada da aplicação — por isso a trilha nunca
 * aparece como `down` aqui. O que esta verificação vigia é a **assinatura**: sem
 * `AUDIT_HMAC_KEY` os checkpoints simplesmente não são gravados, em silêncio, e a plataforma
 * segue funcionando enquanto perde a única proteção contra reescrita com acesso ao banco.
 *
 * O atraso é medido em eventos, não em tempo: as âncoras são gravadas por contagem, então
 * plataforma parada durante a madrugada não é sintoma de nada.
 */
export function auditCheck(snapshot: AuditSnapshot): HealthCheck {
  const base = { key: "audit", label: "Âncoras da auditoria" };

  if (!snapshot.signingConfigured) {
    return {
      ...base,
      status: "warn",
      detail:
        "AUDIT_HMAC_KEY ausente: os checkpoints não estão sendo gravados. A cadeia de hash " +
        "continua válida, mas não há assinatura que impeça reescrita por quem tenha o banco.",
    };
  }

  if (snapshot.headSeq === null) {
    return { ...base, status: "ok", detail: "Trilha ainda vazia." };
  }

  const pending = snapshot.headSeq - (snapshot.checkpointSeq ?? 0n);
  // Uma âncora atrasada é normal — ela só é gravada quando o ciclo de sincronização passa.
  // Várias janelas de atraso significam que esse ciclo parou de rodar.
  const tolerated = BigInt(snapshot.checkpointEvery) * 3n;

  if (pending > tolerated) {
    return {
      ...base,
      status: "warn",
      detail: `${pending} eventos sem âncora, acima dos ${tolerated} tolerados. O ciclo que grava checkpoints pode ter parado.`,
    };
  }

  return {
    ...base,
    status: "ok",
    detail:
      snapshot.checkpointSeq === null
        ? `${pending} eventos até a primeira âncora, gravada a cada ${snapshot.checkpointEvery}.`
        : `Última âncora no evento nº ${snapshot.checkpointSeq}, com ${pending} eventos desde então.`,
  };
}
