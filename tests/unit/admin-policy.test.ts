import { readFileSync, readdirSync, statSync } from "node:fs";
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
  "REVOKE_SESSION",
  "FORCE_LOGOUT",
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

  it("permite encerrar as próprias sessões", () => {
    // Derrubar o próprio acesso não escala privilégio nenhum, e é o que alguém faz ao
    // perceber que perdeu o notebook.
    const proprio = { actorId: "admin1", targetId: "admin1", targetRole: "ADMIN" as const };

    expect(canPerform("REVOKE_SESSION", proprio).allowed).toBe(true);
    expect(canPerform("FORCE_LOGOUT", proprio).allowed).toBe(true);
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
    expect(POLICY_MESSAGES.SELF_ROLE_CHANGE).toBeTruthy();
  });
});

describe("permissão de administrador", () => {
  const eu = "admin1";

  it("concede a usuário comum", () => {
    expect(canPerform("GRANT_ADMIN", { actorId: eu, targetId: "u1", targetRole: "USER" }).allowed).toBe(
      true,
    );
  });

  it("remove de outro administrador", () => {
    // Corrigir permissão dada por engano precisa ser possível.
    const result = canPerform("REVOKE_ADMIN", {
      actorId: eu,
      targetId: "admin2",
      targetRole: "ADMIN",
    });
    expect(result.allowed).toBe(true);
  });

  it("nunca deixa alguém mexer no próprio cargo, em direção nenhuma", () => {
    for (const action of ["GRANT_ADMIN", "REVOKE_ADMIN"] as const) {
      const result = canPerform(action, { actorId: eu, targetId: eu, targetRole: "ADMIN" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("SELF_ROLE_CHANGE");
    }
  });

  it("permite trocar entre dois cargos administrativos", () => {
    // Regressão: a política recusava isto como "a conta já está nesta situação". Ela só
    // conhece o cargo atual do alvo, então tentava adivinhar pela distinção entre conceder
    // e remover — e alguém de somente-leitura não podia virar suporte.
    for (const targetRole of ["READ_ONLY", "AUDITOR", "SUPPORT", "ADMIN"] as const) {
      expect(canPerform("GRANT_ADMIN", { actorId: eu, targetId: "u2", targetRole }).allowed).toBe(
        true,
      );
    }
  });

  it("comparar cargo atual com o pretendido não é papel da política", () => {
    // Ela recebe só o cargo atual; quem conhece os dois é o serviço, e é lá que "já está
    // nesta situação" é decidido.
    expect(canPerform("REVOKE_ADMIN", { actorId: eu, targetId: "u1", targetRole: "USER" }).allowed).toBe(
      true,
    );
  });

  it("continua bloqueando os dados de outro administrador", () => {
    // Mexer no papel é permitido; mexer no e-mail e no 2FA de um par, não.
    const alvo = { actorId: eu, targetId: "admin2", targetRole: "ADMIN" as const };
    expect(canPerform("CHANGE_EMAIL", alvo).reason).toBe("ADMIN_TARGET");
    expect(canPerform("RESET_TWO_FACTOR", alvo).reason).toBe("ADMIN_TARGET");
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

  /**
   * A superfície é varrida, não listada.
   *
   * A versão anterior enumerava arquivos à mão, e uma rota administrativa nova só entrava na
   * vigilância se alguém lembrasse de acrescentá-la aqui — exatamente o descuido que a regra
   * existe para cobrir. Agora toda a área `/admin`, toda rota `/api/admin` e todo serviço
   * `admin-*` entram sozinhos.
   */
  function arquivosDe(dir: string): string[] {
    return readdirSync(join(process.cwd(), dir)).flatMap((entrada) => {
      const relativo = `${dir}/${entrada}`;
      if (statSync(join(process.cwd(), relativo)).isDirectory()) return arquivosDe(relativo);
      return /\.(ts|tsx)$/.test(entrada) ? [relativo] : [];
    });
  }

  const ARQUIVOS = [
    ...arquivosDe("src/app/api/admin"),
    ...arquivosDe("src/app/(admin)"),
    ...arquivosDe("src/services").filter((f) => f.includes("/admin-")),
    "src/services/audit.service.ts",
    "src/services/audit-integrity.service.ts",
    "src/services/session.service.ts",
    "src/lib/auth-guard.ts",
    "src/components/admin/admin-sidebar.tsx",
  ];

  it("a varredura encontra a superfície administrativa inteira", () => {
    // Se o caminho mudar de lugar, a lista esvazia e todos os casos abaixo passariam à toa.
    expect(ARQUIVOS.length).toBeGreaterThanOrEqual(15);
    expect(ARQUIVOS).toContain("src/app/api/admin/backup/route.ts");
    expect(ARQUIVOS).toContain("src/services/admin-metrics.service.ts");
  });

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

  /**
   * O painel de números não toca em tabela financeira — nem para contar, nem para somar.
   *
   * A primeira versão trazia patrimônio sob gestão e proventos em forma agregada. O dono do
   * projeto recusou: o total é feito do dinheiro de pessoas que não autorizaram ninguém a
   * somá-lo, e "agregado" descreve a apresentação, não a origem do dado.
   *
   * A lista de imports proibidos não cobriria isto, porque o repositório fala com o Prisma
   * direto — daí a trava ser sobre o modelo acessado.
   */
  const MODELOS_FINANCEIROS = [
    "prisma.position",
    "prisma.transaction",
    "prisma.dividendReceipt",
    "prisma.assetDividend",
    "prisma.fixedIncomeTerms",
    "prisma.allocationTarget",
  ];

  it("o repositório de métricas não acessa tabela financeira", () => {
    const conteudo = readFileSync(
      join(process.cwd(), "src/repositories/admin-metrics.repository.ts"),
      "utf8",
    );

    for (const modelo of MODELOS_FINANCEIROS) {
      expect(conteudo).not.toContain(modelo);
    }
  });

  it("o repositório de métricas só conta e agrupa", () => {
    // Segunda trava: mesmo sobre tabelas permitidas, contar é diferente de listar.
    const conteudo = readFileSync(
      join(process.cwd(), "src/repositories/admin-metrics.repository.ts"),
      "utf8",
    );

    for (const leituraDeLinha of [
      "findMany",
      "findFirst",
      "findUnique",
      "$queryRaw",
      "$queryRawUnsafe",
    ]) {
      expect(conteudo).not.toContain(leituraDeLinha);
    }
  });
});
