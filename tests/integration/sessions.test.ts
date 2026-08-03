import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase, createUser } from "./helpers";

describe("sessões (banco real)", () => {
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

    // Pelo serviço, e não por escrita direta no banco: `isActive` guarda a resposta
    // positiva no Redis por 60 segundos, e é o `revoke` que derruba essa entrada. Revogar
    // por fora deixaria a sessão viva até o cache expirar — a versão anterior deste teste
    // fazia isso e cobrava do código um comportamento que nenhum caminho real produz.
    await sessionService.revoke({
      sessionId: session.id,
      userId: user.id,
      userEmail: user.email,
      revokedBy: user.id,
      actorEmail: user.email,
      reason: "Revogada no teste",
    });

    expect(await sessionService.isActive(session.id)).toBe(false);
  });

  it("a revogação fica gravada com autor e motivo", async () => {
    const { sessionService } = await import("@/services/session.service");
    const user = await createUser();
    const session = await createSession(user.id);

    await sessionService.revoke({
      sessionId: session.id,
      userId: user.id,
      userEmail: user.email,
      revokedBy: user.id,
      actorEmail: user.email,
      reason: "Encerrada pelo próprio usuário",
    });

    const gravada = await prisma.userSession.findUnique({ where: { id: session.id } });
    expect(gravada?.revokedAt).not.toBeNull();
    expect(gravada?.revokedBy).toBe(user.id);
    expect(gravada?.revocationReason).toBe("Encerrada pelo próprio usuário");
  });

  it("forçar logout derruba as sessões e invalida os tokens já emitidos", async () => {
    // As duas escritas importam: revogar as linhas dá o registro de quem encerrou o quê;
    // mover `sessionsValidFrom` é o que mata token apátrida, que valeria mais 30 dias.
    const { adminUserService } = await import("@/services/admin-user.service");
    const { sessionService } = await import("@/services/session.service");

    const alvo = await createUser("alvo@investhub.local");
    const admin = await createUser("admin@investhub.local");
    const primeira = await createSession(alvo.id);
    const segunda = await createSession(alvo.id);

    const encerradas = await adminUserService.forceLogout(
      { adminId: admin.id, adminEmail: admin.email, reason: "Conta comprometida no chamado #9" },
      alvo.id,
    );

    expect(encerradas).toBe(2);

    const depois = await prisma.user.findUnique({ where: { id: alvo.id } });
    expect(depois?.sessionsValidFrom).not.toBeNull();

    for (const sessao of [primeira, segunda]) {
      expect(await sessionService.isActive(sessao.id, depois!.sessionsValidFrom)).toBe(false);
    }

    // E fica a prova de quem fez, com o motivo escrito.
    const evento = await prisma.auditLog.findFirst({ where: { action: "ADMIN_SESSIONS_REVOKED" } });
    expect(evento?.actorId).toBe(admin.id);
    expect(evento?.reason).toBe("Conta comprometida no chamado #9");
  });

  it("forçar logout sobre a própria conta preserva a sessão em uso", async () => {
    // Sem isto, o administrador se expulsaria no meio da operação.
    const { adminUserService } = await import("@/services/admin-user.service");

    const admin = await createUser("admin2@investhub.local");
    const antiga = await createSession(admin.id);
    const atual = await createSession(admin.id);

    await adminUserService.forceLogout(
      {
        adminId: admin.id,
        adminEmail: admin.email,
        sessionId: atual.id,
        reason: "Encerrando acessos antigos",
      },
      admin.id,
    );

    const depois = await prisma.userSession.findMany({ where: { userId: admin.id } });
    const porId = new Map(depois.map((sessao) => [sessao.id, sessao]));

    expect(porId.get(antiga.id)?.revokedAt).not.toBeNull();
    expect(porId.get(atual.id)?.revokedAt).toBeNull();
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
