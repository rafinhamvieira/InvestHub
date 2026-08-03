import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasDatabase, prisma, resetDatabase, createUser } from "./helpers";

/**
 * O que só o banco pode provar.
 *
 * Imutabilidade e encadeamento vivem em triggers do Postgres — teste com mock não diria
 * nada sobre eles. Aqui o SQL é exercitado de verdade.
 */
describe.skipIf(!hasDatabase)("trilha de auditoria no banco", () => {
  beforeEach(resetDatabase);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function append(action: string, extra: Record<string, unknown> = {}) {
    return prisma.auditLog.create({ data: { action, ...extra } });
  }

  it("recusa UPDATE em registro de auditoria", async () => {
    const log = await append("LOGIN_SUCCESS");

    await expect(
      prisma.auditLog.update({ where: { id: log.id }, data: { action: "OUTRA_COISA" } }),
    ).rejects.toThrow(/append-only/i);

    const depois = await prisma.auditLog.findUnique({ where: { id: log.id } });
    expect(depois?.action).toBe("LOGIN_SUCCESS");
  });

  it("recusa DELETE em registro de auditoria", async () => {
    const log = await append("PASSWORD_CHANGED");

    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(
      /append-only/i,
    );
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it("recusa apagar a trilha inteira", async () => {
    await append("LOGIN_SUCCESS");
    await append("LOGOUT");

    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/i);
    expect(await prisma.auditLog.count()).toBe(2);
  });

  it("encadeia cada registro ao anterior", async () => {
    const primeiro = await append("LOGIN_SUCCESS");
    const segundo = await append("LOGOUT");
    const terceiro = await append("PASSWORD_CHANGED");

    expect(primeiro.prevHash).toBeNull();
    expect(primeiro.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(segundo.prevHash).toBe(primeiro.hash);
    expect(terceiro.prevHash).toBe(segundo.hash);
    // Sequência monotônica: buraco é evidência de remoção.
    expect(segundo.seq).toBe(primeiro.seq + 1n);
  });

  it("mantém o registro legível depois de a conta ser excluída", async () => {
    const user = await createUser("some@investhub.local");
    await append("USER_REGISTERED", {
      userId: user.id,
      targetEmail: user.email,
      actorId: user.id,
      actorEmail: user.email,
    });

    await prisma.user.delete({ where: { id: user.id } });

    const log = await prisma.auditLog.findFirst();
    expect(log).not.toBeNull();
    // Vínculo some, identidade permanece.
    expect(log!.userId).toBeNull();
    expect(log!.targetEmail).toBe("some@investhub.local");
  });

  it("hash calculado pelo banco confere com o recomputado pela aplicação", async () => {
    // Se o payload do trigger e o da verificação divergirem, a integridade acusaria
    // adulteração onde não houve — é o ponto mais frágil do mecanismo.
    const { computeHash } = await import("@/services/audit-integrity.service");

    await append("LOGIN_SUCCESS", {
      userId: null,
      targetEmail: "alvo@exemplo.com",
      actorEmail: "autor@exemplo.com",
      sessionId: "sess-1",
      ipAddress: "203.0.113.9",
      reason: "motivo registrado",
      metadata: { origem: "teste" },
    });

    const [row] = await prisma.auditLog.findMany({ orderBy: { seq: "asc" } });
    expect(computeHash(row as never, row!.prevHash)).toBe(row!.hash);
  });
});
