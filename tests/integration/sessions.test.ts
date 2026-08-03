import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasDatabase, prisma, resetDatabase, createUser } from "./helpers";

describe.skipIf(!hasDatabase)("sessões (banco real)", () => {
  beforeEach(resetDatabase);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createSession(userId: string, overrides: Record<string, unknown> = {}) {
    return prisma.userSession.create({
      data: {
        userId,
        expiresAt: new Date(Date.now() + 60_000),
        browser: "Chrome",
        os: "Windows 10/11",
        ...overrides,
      },
    });
  }

  it("sessão revogada perde acesso mesmo com token válido", async () => {
    const { sessionService } = await import("@/services/session.service");
    const user = await createUser();
    const session = await createSession(user.id);

    expect(await sessionService.isActive(session.id)).toBe(true);

    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revocationReason: "Revogada no teste" },
    });

    expect(await sessionService.isActive(session.id)).toBe(false);
  });

  it("sessão expirada não vale", async () => {
    const { sessionService } = await import("@/services/session.service");
    const user = await createUser();
    const session = await createSession(user.id, { expiresAt: new Date(Date.now() - 1000) });

    expect(await sessionService.isActive(session.id)).toBe(false);
  });

  it("sessionsValidFrom invalida em bloco as sessões anteriores", async () => {
    const { sessionService } = await import("@/services/session.service");
    const user = await createUser();
    const antiga = await createSession(user.id);

    // "Forçar logout": tudo que nasceu antes deste instante morre.
    const corte = new Date(Date.now() + 1000);
    expect(await sessionService.isActive(antiga.id, corte)).toBe(false);
  });

  it("revogar duas vezes preserva data e motivo originais", async () => {
    const { userSessionRepository } = await import("@/repositories/user-session.repository");
    const user = await createUser();
    const session = await createSession(user.id);

    await userSessionRepository.revoke(session.id, user.id, "Primeiro motivo");
    const primeira = await prisma.userSession.findUnique({ where: { id: session.id } });

    await userSessionRepository.revoke(session.id, user.id, "Segundo motivo");
    const segunda = await prisma.userSession.findUnique({ where: { id: session.id } });

    expect(segunda!.revocationReason).toBe("Primeiro motivo");
    expect(segunda!.revokedAt).toEqual(primeira!.revokedAt);
  });

  it("conta sessões vivas em uma consulta só", async () => {
    const { userSessionRepository } = await import("@/repositories/user-session.repository");
    const user = await createUser();

    await createSession(user.id);
    await createSession(user.id);
    await createSession(user.id, { revokedAt: new Date() });
    await createSession(user.id, { expiresAt: new Date(Date.now() - 1000) });

    const contagem = await userSessionRepository.countActiveByUsers([user.id]);
    expect(contagem.get(user.id)).toBe(2);
  });
});
