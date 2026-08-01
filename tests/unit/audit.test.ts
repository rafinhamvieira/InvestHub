import { describe, expect, it } from "vitest";
import { buildActionWhere } from "@/repositories/audit-log.repository";
import { buildLoginWhere } from "@/repositories/login-audit.repository";
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, categoryOf } from "@/constants/audit";
import type { AuditFilters } from "@/types/audit";

const base: AuditFilters = { page: 1, pageSize: 50 };

describe("catálogo de eventos", () => {
  it("tem rótulo em português para toda ação registrável", () => {
    for (const action of Object.values(AUDIT_ACTIONS)) {
      expect(AUDIT_ACTION_LABELS[action]).toBeTruthy();
    }
  });

  it("classifica a ação na categoria certa", () => {
    expect(categoryOf(AUDIT_ACTIONS.PASSWORD_CHANGED)).toBe("PASSWORD");
    expect(categoryOf(AUDIT_ACTIONS.TWO_FACTOR_ENABLED)).toBe("TWO_FACTOR");
    expect(categoryOf(AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_ADMIN)).toBe("TWO_FACTOR");
    expect(categoryOf(AUDIT_ACTIONS.ADMIN_USER_RENAMED)).toBe("ADMIN");
    expect(categoryOf(AUDIT_ACTIONS.USER_REGISTERED)).toBe("ACCOUNT");
    expect(categoryOf("LOGIN_SUCCESS")).toBe("LOGIN");
  });

  it("não classifica reset de 2FA feito pelo admin como categoria de conta", () => {
    // A ação começa com TWO_FACTOR e termina com BY_ADMIN: a ordem das regras importa.
    expect(categoryOf(AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_ADMIN)).not.toBe("ACCOUNT");
  });
});

describe("filtro da trilha de ações", () => {
  it("sem filtro, não restringe nada", () => {
    expect(buildActionWhere(base)).toEqual({});
  });

  it("categoria vira prefixo de ação", () => {
    const where = buildActionWhere({ ...base, category: "PASSWORD" });
    expect(where.OR).toEqual([{ action: { startsWith: "PASSWORD_" } }]);
  });

  it("categoria de acessos não devolve ação nenhuma — aquela trilha é outra tabela", () => {
    const where = buildActionWhere({ ...base, category: "LOGIN" });
    expect(where).toEqual({ id: "__sem-correspondencia__" });
  });

  it("busca cobre nome e e-mail do autor, sem diferenciar maiúsculas", () => {
    const where = buildActionWhere({ ...base, search: "Rafael" });
    expect(where.user).toEqual({
      OR: [
        { name: { contains: "Rafael", mode: "insensitive" } },
        { email: { contains: "Rafael", mode: "insensitive" } },
      ],
    });
  });

  it("período é inclusivo nas duas pontas", () => {
    const where = buildActionWhere({
      ...base,
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-31T23:59:59.999Z",
    });
    expect(where.createdAt).toEqual({
      gte: new Date("2026-07-01T00:00:00.000Z"),
      lte: new Date("2026-07-31T23:59:59.999Z"),
    });
  });

  it("filtra por usuário quando pedido", () => {
    expect(buildActionWhere({ ...base, userId: "u1" }).userId).toBe("u1");
  });
});

describe("filtro da trilha de acessos", () => {
  it("busca bate no e-mail da tentativa, não no cadastro", () => {
    // Tentativa em e-mail inexistente não tem usuário associado — e é o caso que mais
    // interessa numa investigação de acesso indevido.
    const where = buildLoginWhere({ ...base, search: "invasor@teste.com" });
    expect(where.email).toEqual({ contains: "invasor@teste.com", mode: "insensitive" });
    expect(where.user).toBeUndefined();
  });

  it("aceita recorte por usuário e período", () => {
    const where = buildLoginWhere({ ...base, userId: "u1", from: "2026-07-01T00:00:00.000Z" });
    expect(where.userId).toBe("u1");
    expect(where.createdAt).toEqual({ gte: new Date("2026-07-01T00:00:00.000Z") });
  });
});
