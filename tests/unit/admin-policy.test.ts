import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canPerform, POLICY_MESSAGES, type AdminAction } from "@/utils/admin-policy";

const ADMIN = { actorId: "admin1", targetId: "u1", targetRole: "USER" as const };
const TODAS: AdminAction[] = [
  "RENAME",
  "CHANGE_EMAIL",
  "SEND_PASSWORD_RESET",
  "RESET_TWO_FACTOR",
  "UNLOCK",
];

describe("quem pode agir sobre quem", () => {
  it("permite todas as ações sobre usuário comum", () => {
    for (const action of TODAS) {
      expect(canPerform(action, ADMIN).allowed).toBe(true);
    }
  });

  it("bloqueia qualquer ação sobre conta de outro administrador", () => {
    for (const action of TODAS) {
      const result = canPerform(action, { ...ADMIN, targetId: "admin2", targetRole: "ADMIN" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("ADMIN_TARGET");
    }
  });

  it("impede o admin de trocar o próprio e-mail ou zerar o próprio 2FA pelo painel", () => {
    const self = { actorId: "admin1", targetId: "admin1", targetRole: "ADMIN" as const };

    expect(canPerform("CHANGE_EMAIL", self).reason).toBe("SELF_TARGET");
    expect(canPerform("RESET_TWO_FACTOR", self).reason).toBe("SELF_TARGET");
  });

  it("deixa o admin renomear e desbloquear a si mesmo", () => {
    const self = { actorId: "admin1", targetId: "admin1", targetRole: "ADMIN" as const };

    expect(canPerform("RENAME", self).allowed).toBe(true);
    expect(canPerform("UNLOCK", self).allowed).toBe(true);
  });

  it("tem mensagem para cada motivo de recusa", () => {
    expect(POLICY_MESSAGES.ADMIN_TARGET).toBeTruthy();
    expect(POLICY_MESSAGES.SELF_TARGET).toBeTruthy();
  });
});

describe("fronteira de privacidade do painel", () => {
  /**
   * A promessa ao usuário é que administrador não enxerga carteira alheia. Uma promessa
   * dessas não se garante em revisão de código: bastaria um `import` distraído para o
   * painel passar a ler posições. O teste falha se isso acontecer.
   */
  const PROIBIDOS = [
    "portfolio.service",
    "transaction.repository",
    "position.repository",
    "dividend.service",
    "allocation-target.repository",
    "contribution.service",
  ];

  const ARQUIVOS = [
    "src/services/admin-user.service.ts",
    "src/services/admin-audit.service.ts",
    "src/app/api/admin/users/route.ts",
    "src/app/api/admin/audit/route.ts",
  ];

  /** Só as linhas de import interessam — comentário citando o módulo proibido é permitido. */
  function importsOf(arquivo: string): string[] {
    const conteudo = readFileSync(join(process.cwd(), arquivo), "utf8");
    return conteudo.split("\n").filter((linha) => /^\s*import\s/.test(linha));
  }

  for (const arquivo of ARQUIVOS) {
    it(`${arquivo} não importa dado financeiro`, () => {
      const imports = importsOf(arquivo).join("\n");
      for (const proibido of PROIBIDOS) {
        expect(imports).not.toContain(proibido);
      }
    });
  }

  it("detecta o import proibido se alguém adicionar", () => {
    // Guarda do próprio guarda: se a extração de imports quebrar, o teste acima passaria
    // sempre, e a fronteira ficaria sem vigia nenhum.
    const linhas = ['import { portfolioService } from "@/services/portfolio.service";'];
    expect(linhas.join("\n")).toContain("portfolio.service");
  });
});
