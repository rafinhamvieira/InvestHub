import { describe, expect, it } from "vitest";
import {
  auditCheck,
  backupCheck,
  describeAge,
  latencyCheck,
  syncCheck,
  worstStatus,
  type SyncSnapshot,
} from "@/utils/health-status";

const AGORA = new Date("2026-03-10T12:00:00.000Z");

function horasAtras(horas: number): string {
  return new Date(AGORA.getTime() - horas * 60 * 60 * 1000).toISOString();
}

describe("worstStatus", () => {
  it("uma falha domina o conjunto", () => {
    expect(worstStatus(["ok", "warn", "down"])).toBe("down");
  });

  it("aviso domina quando não há falha", () => {
    expect(worstStatus(["ok", "warn", "ok"])).toBe("warn");
  });

  it("tudo certo só quando nada destoa", () => {
    expect(worstStatus(["ok", "ok"])).toBe("ok");
    expect(worstStatus([])).toBe("ok");
  });
});

describe("describeAge", () => {
  it("usa minutos abaixo de uma hora", () => {
    expect(describeAge(0.5)).toBe("há 30 min");
  });

  it("nunca diz 'há 0 min' — o mínimo é 1", () => {
    expect(describeAge(0.001)).toBe("há 1 min");
  });

  it("vira dias a partir de dois", () => {
    expect(describeAge(6)).toBe("há 6 h");
    expect(describeAge(72)).toBe("há 3 dias");
  });
});

describe("latencyCheck", () => {
  it("erro na sondagem é falha, e a mensagem do erro vai para a tela", () => {
    const check = latencyCheck("database", "Banco", { latencyMs: 12, error: "conexão recusada" }, 300);

    expect(check.status).toBe("down");
    expect(check.detail).toBe("conexão recusada");
  });

  it("acima do limite avisa sem declarar falha", () => {
    expect(latencyCheck("database", "Banco", { latencyMs: 400 }, 300).status).toBe("warn");
  });

  it("dentro do limite está saudável", () => {
    const check = latencyCheck("database", "Banco", { latencyMs: 20 }, 300);

    expect(check.status).toBe("ok");
    expect(check.latencyMs).toBe(20);
  });

  it("o limite em si ainda é saudável", () => {
    expect(latencyCheck("cache", "Cache", { latencyMs: 100 }, 100).status).toBe("ok");
  });
});

describe("syncCheck", () => {
  const base: SyncSnapshot = {
    lastSuccessAt: horasAtras(1),
    failures: 0,
    staleHours: 3,
    failureThreshold: 3,
  };

  it("sem histórico apenas avisa — é o estado de um container recém-subido", () => {
    const check = syncCheck({ ...base, lastSuccessAt: null }, AGORA);

    expect(check.status).toBe("warn");
    expect(check.detail).toContain("Nenhuma sincronização registrada");
  });

  it("parado além da janela é falha, ainda que não haja erro contado", () => {
    const check = syncCheck({ ...base, lastSuccessAt: horasAtras(5) }, AGORA);

    expect(check.status).toBe("down");
  });

  it("falhando dentro da janela avisa: erra, mas ainda tenta", () => {
    const check = syncCheck({ ...base, failures: 3 }, AGORA);

    expect(check.status).toBe("warn");
    expect(check.detail).toContain("3 falhas seguidas");
  });

  it("estar parado pesa mais que estar falhando", () => {
    // As duas condições ao mesmo tempo: quem lê precisa ver a pior das duas.
    const check = syncCheck({ ...base, lastSuccessAt: horasAtras(9), failures: 4 }, AGORA);

    expect(check.status).toBe("down");
  });

  it("falha isolada abaixo do limite não tira do saudável", () => {
    const check = syncCheck({ ...base, failures: 1 }, AGORA);

    expect(check.status).toBe("ok");
    expect(check.detail).toContain("1 falha(s)");
  });
});

describe("backupCheck", () => {
  it("ausência de backup é falha, não aviso", () => {
    expect(backupCheck(null, AGORA).status).toBe("down");
  });

  it("backup do dia está saudável", () => {
    expect(backupCheck(horasAtras(6), AGORA).status).toBe("ok");
  });

  it("um ciclo diário perdido vira aviso", () => {
    expect(backupCheck(horasAtras(40), AGORA).status).toBe("warn");
  });

  it("três dias sem cópia é falha", () => {
    expect(backupCheck(horasAtras(80), AGORA).status).toBe("down");
  });

  it("respeita limiares informados", () => {
    expect(backupCheck(horasAtras(10), AGORA, { warnHours: 6, downHours: 12 }).status).toBe("warn");
  });
});

describe("auditCheck", () => {
  const base = {
    headSeq: 1000n,
    checkpointSeq: 1000n,
    signingConfigured: true,
    checkpointEvery: 500,
  };

  it("chave ausente avisa, porque os checkpoints param em silêncio", () => {
    const check = auditCheck({ ...base, signingConfigured: false });

    expect(check.status).toBe("warn");
    expect(check.detail).toContain("AUDIT_HMAC_KEY");
  });

  it("trilha vazia é estado saudável", () => {
    const check = auditCheck({ ...base, headSeq: null, checkpointSeq: null });

    expect(check.status).toBe("ok");
    expect(check.detail).toBe("Trilha ainda vazia.");
  });

  it("uma âncora atrasada é normal — ela só é gravada no ciclo de sincronização", () => {
    expect(auditCheck({ ...base, headSeq: 1400n }).status).toBe("ok");
  });

  it("atraso de várias janelas indica que o ciclo parou", () => {
    const check = auditCheck({ ...base, headSeq: 3000n });

    expect(check.status).toBe("warn");
    expect(check.detail).toContain("2000 eventos sem âncora");
  });

  it("conta a partir do zero quando nenhuma âncora foi gravada ainda", () => {
    const check = auditCheck({ ...base, headSeq: 300n, checkpointSeq: null });

    expect(check.status).toBe("ok");
    expect(check.detail).toContain("300 eventos até a primeira âncora");
  });
});
