import { beforeEach, describe, expect, it, vi } from "vitest";

const append = vi.fn();
const loggerError = vi.fn();

vi.mock("@/repositories/audit-log.repository", () => ({
  auditLogRepository: { append: (...args: unknown[]) => append(...args) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args), warn: vi.fn(), info: vi.fn() },
}));

const { auditService, AuditWriteError, AuditReasonRequiredError } = await import(
  "@/services/audit.service"
);
const { AUDIT_ACTIONS } = await import("@/constants/audit");

describe("política de falha da auditoria", () => {
  beforeEach(() => {
    append.mockReset();
    loggerError.mockReset();
  });

  it("aborta a operação quando um evento de segurança não grava", async () => {
    // Perder o registro de um login é perder a evidência que a auditoria existe para guardar.
    append.mockRejectedValueOnce(new Error("banco fora do ar"));

    await expect(
      auditService.record({ action: AUDIT_ACTIONS.LOGIN_SUCCESS, userId: "u1" }),
    ).rejects.toBeInstanceOf(AuditWriteError);

    expect(loggerError).toHaveBeenCalled();
  });

  it("segue o fluxo quando um evento comum não grava", async () => {
    append.mockRejectedValueOnce(new Error("banco fora do ar"));

    await expect(
      auditService.record({ action: AUDIT_ACTIONS.PROFILE_UPDATED, userId: "u1" }),
    ).resolves.toBeUndefined();

    // O erro não some: vai para os logs da aplicação.
    expect(loggerError).toHaveBeenCalled();
  });

  it("trata alteração de senha e MFA como crítica", async () => {
    for (const action of [
      AUDIT_ACTIONS.PASSWORD_CHANGED,
      AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
      AUDIT_ACTIONS.EMAIL_CHANGED,
      AUDIT_ACTIONS.ADMIN_ROLE_GRANTED,
    ]) {
      append.mockRejectedValueOnce(new Error("falhou"));
      await expect(
        auditService.record({ action, userId: "u1", reason: "motivo suficientemente longo" }),
      ).rejects.toBeInstanceOf(AuditWriteError);
    }
  });

  it("recusa ação crítica sem justificativa antes de qualquer escrita", async () => {
    await expect(
      auditService.record({ action: AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_ADMIN, userId: "u1" }),
    ).rejects.toBeInstanceOf(AuditReasonRequiredError);

    expect(append).not.toHaveBeenCalled();
  });

  it("aceita justificativa preenchida", async () => {
    append.mockResolvedValueOnce({ id: "a1", seq: 1n, hash: "abc" });

    await auditService.record({
      action: AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_ADMIN,
      userId: "u1",
      reason: "Usuário perdeu o aparelho e os códigos de recuperação",
    });

    expect(append).toHaveBeenCalledOnce();
  });

  it("não expõe método de atualização ou remoção", async () => {
    // A garantia de append-only começa pela ausência: método que não existe não é chamado.
    const service = auditService as unknown as Record<string, unknown>;
    expect(service.update).toBeUndefined();
    expect(service.delete).toBeUndefined();
    expect(service.remove).toBeUndefined();
  });
});
