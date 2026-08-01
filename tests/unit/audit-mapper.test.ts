import { describe, expect, it } from "vitest";
import { mapActionRow, mapLoginRow, mergeEntries, toCsv } from "@/utils/audit-mapper";
import { AUDIT_ACTIONS } from "@/constants/audit";
import type { AuditEntry } from "@/types/audit";

const user = { id: "u1", name: "Rafael", email: "rafael@exemplo.com" };

function entryAt(iso: string, id = iso): AuditEntry {
  return {
    id,
    source: "ACTION",
    action: "PASSWORD_CHANGED",
    label: "Senha alterada",
    category: "PASSWORD",
    userId: "u1",
    userName: "Rafael",
    userEmail: "rafael@exemplo.com",
    success: null,
    reason: null,
    ipAddress: null,
    userAgent: null,
    targetUserId: null,
    createdAt: iso,
  };
}

describe("trilha de ações", () => {
  it("traduz a ação e separa autor de alvo", () => {
    const entry = mapActionRow({
      id: "a1",
      action: AUDIT_ACTIONS.ADMIN_USER_RENAMED,
      userId: "admin1",
      entityId: "alvo1",
      ipAddress: "203.0.113.9",
      userAgent: "Mozilla/5.0",
      createdAt: new Date("2026-07-31T12:00:00.000Z"),
      user: { id: "admin1", name: "Admin", email: "admin@exemplo.com" },
    });

    expect(entry.label).toBe("Nome alterado pelo administrador");
    expect(entry.category).toBe("ADMIN");
    expect(entry.userId).toBe("admin1");
    expect(entry.targetUserId).toBe("alvo1");
    expect(entry.id).toBe("action:a1");
  });

  it("ação desconhecida vira o próprio código, sem linha vazia", () => {
    const entry = mapActionRow({
      id: "a2",
      action: "EVENTO_NOVO_AINDA_SEM_ROTULO",
      userId: null,
      entityId: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      user: null,
    });
    expect(entry.label).toBe("EVENTO_NOVO_AINDA_SEM_ROTULO");
  });
});

describe("trilha de acessos", () => {
  it("mantém o e-mail digitado quando a conta não existe", () => {
    const entry = mapLoginRow({
      id: "l1",
      email: "invasor@teste.com",
      success: false,
      reason: "USER_NOT_FOUND",
      userId: null,
      ipAddress: "198.51.100.7",
      userAgent: "curl/8",
      createdAt: new Date("2026-07-31T10:00:00.000Z"),
      user: null,
    });

    expect(entry.userEmail).toBe("invasor@teste.com");
    expect(entry.success).toBe(false);
    expect(entry.reason).toBe("E-mail não cadastrado");
    expect(entry.category).toBe("LOGIN");
  });

  it("marca sucesso e usa o cadastro quando existe", () => {
    const entry = mapLoginRow({
      id: "l2",
      email: "rafael@exemplo.com",
      success: true,
      reason: null,
      userId: "u1",
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      user,
    });

    expect(entry.label).toBe("Login realizado");
    expect(entry.userName).toBe("Rafael");
    expect(entry.reason).toBeNull();
  });
});

describe("fusão das trilhas", () => {
  it("ordena do mais recente para o mais antigo e recorta a página", () => {
    const acoes = [entryAt("2026-07-31T10:00:00.000Z", "a"), entryAt("2026-07-29T10:00:00.000Z", "c")];
    const acessos = [entryAt("2026-07-30T10:00:00.000Z", "b")];

    expect(mergeEntries([acoes, acessos], 1, 2).map((e) => e.id)).toEqual(["a", "b"]);
    expect(mergeEntries([acoes, acessos], 2, 2).map((e) => e.id)).toEqual(["c"]);
    expect(mergeEntries([acoes, acessos], 3, 2)).toEqual([]);
  });
});

describe("export CSV", () => {
  it("neutraliza separador e quebra de linha vindos do dado", () => {
    const entry = {
      ...entryAt("2026-07-31T10:00:00.000Z"),
      userName: "Nome; com ponto e vírgula\ne quebra",
    };

    const linhas = toCsv([entry]).split("\n");
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).not.toContain("Nome;");
  });
});
