import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FINANCIAL_EXPOSURE_PERMISSIONS,
  Permission,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  adminRoles,
  can,
  hasAdminAccess,
  isOwnerRole,
} from "@/lib/permissions";
import { ADMIN_NAV } from "@/config/admin-nav";
import type { Role } from "@prisma/client";

const ROLES: Role[] = ["USER", "READ_ONLY", "AUDITOR", "SUPPORT", "ADMIN", "SUPER_ADMIN"];

describe("mapa de permissões", () => {
  it("cobre todos os cargos", () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it("usuário comum não tem nenhuma permissão administrativa", () => {
    for (const permission of Object.values(Permission)) {
      expect(can({ id: "u1", role: "USER" }, permission)).toBe(false);
    }
    expect(hasAdminAccess({ id: "u1", role: "USER" })).toBe(false);
  });

  it("super admin tem todas", () => {
    for (const permission of Object.values(Permission)) {
      expect(can({ id: "a1", role: "SUPER_ADMIN" }, permission)).toBe(true);
    }
  });

  it("concentra no super admin as três capacidades que comprometeriam a auditoria", () => {
    // Fabricar administrador, trocar o banco inteiro e atestar a própria trilha.
    const restritas = [
      Permission.MANAGE_ROLES,
      Permission.RESTORE_BACKUP,
      Permission.VERIFY_AUDIT_INTEGRITY,
    ];

    for (const permission of restritas) {
      for (const role of ROLES.filter((r) => r !== "SUPER_ADMIN")) {
        expect(can({ id: "x", role }, permission)).toBe(false);
      }
    }
  });

  it("suporte age sobre usuários, mas não sobre plataforma nem backup", () => {
    const suporte = { id: "s1", role: "SUPPORT" as const };
    expect(can(suporte, Permission.MANAGE_USERS)).toBe(true);
    expect(can(suporte, Permission.MANAGE_BACKUPS)).toBe(false);
    expect(can(suporte, Permission.MANAGE_PLATFORM)).toBe(false);
  });

  it("auditoria e somente leitura não alteram nada", () => {
    for (const role of ["AUDITOR", "READ_ONLY"] as const) {
      expect(can({ id: "x", role }, Permission.VIEW_AUDIT)).toBe(true);
      expect(can({ id: "x", role }, Permission.MANAGE_USERS)).toBe(false);
      expect(can({ id: "x", role }, Permission.MANAGE_BACKUPS)).toBe(false);
    }
  });

  it("números de negócio não alcançam auditoria nem suporte", () => {
    // Nenhuma das duas funções investiga patrimônio sob gestão; o dado a mais só amplia o
    // estrago de um cargo comprometido.
    for (const role of ["AUDITOR", "SUPPORT"] as const) {
      expect(can({ id: "x", role }, Permission.VIEW_BUSINESS_METRICS)).toBe(false);
    }

    for (const role of ["READ_ONLY", "ADMIN", "SUPER_ADMIN"] as const) {
      expect(can({ id: "x", role }, Permission.VIEW_BUSINESS_METRICS)).toBe(true);
    }
  });

  it("todo cargo administrativo enxerga a saúde — é o que abre o painel", () => {
    for (const role of adminRoles()) {
      expect(can({ id: "x", role }, Permission.VIEW_SYSTEM_HEALTH)).toBe(true);
    }
  });

  it("nega quando não há principal", () => {
    expect(can(null, Permission.VIEW_AUDIT)).toBe(false);
    expect(can(undefined, Permission.VIEW_AUDIT)).toBe(false);
  });
});

describe("acesso a dado financeiro", () => {
  /**
   * A promessa ao usuário é que ninguém enxerga a carteira alheia. As telas cumprem isso por
   * construção — nenhum serviço administrativo alcança posição, transação ou provento. O
   * backup é a exceção inevitável: backup que exclui dado não é backup, e o dump carrega
   * tudo de todos.
   *
   * Daí a regra: quem pode baixar ou restaurar o dump é só o `SUPER_ADMIN`, que já opera o
   * servidor e teria o banco de qualquer jeito. Este teste existe para que ampliar esse
   * conjunto seja uma decisão explícita, nunca um efeito colateral de mexer no mapa.
   */
  it("só o super administrador alcança dado financeiro de usuário", () => {
    for (const permission of FINANCIAL_EXPOSURE_PERMISSIONS) {
      expect(can({ id: "x", role: "SUPER_ADMIN" }, permission)).toBe(true);

      for (const role of ROLES.filter((r) => r !== "SUPER_ADMIN")) {
        expect(can({ id: "x", role }, permission)).toBe(false);
      }
    }
  });

  it("administrador comum administra a plataforma sem ler a carteira de ninguém", () => {
    const admin = { id: "a1", role: "ADMIN" as const };

    expect(can(admin, Permission.MANAGE_USERS)).toBe(true);
    expect(can(admin, Permission.MANAGE_PLATFORM)).toBe(true);
    expect(can(admin, Permission.MANAGE_BACKUPS)).toBe(false);
    expect(can(admin, Permission.RESTORE_BACKUP)).toBe(false);
  });
});

describe("cargo que responde pela plataforma", () => {
  it("é exatamente um, e detém todas as permissões", () => {
    const donos = ROLES.filter(isOwnerRole);

    expect(donos).toEqual(["SUPER_ADMIN"]);
    expect(ROLE_PERMISSIONS.SUPER_ADMIN.length).toBe(Object.values(Permission).length);
  });

  it("permissão nova sem dono faria o teste falhar em vez de passar despercebida", () => {
    // `isOwnerRole` compara contra o total de permissões: se alguém acrescentar uma e
    // esquecer de dar ao cargo mais alto, ele deixa de ser dono e a regra do último dono
    // — que impede trancar todo mundo do lado de fora — pararia de valer em silêncio.
    for (const permission of Object.values(Permission)) {
      expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(permission);
    }
  });

  it("todo cargo tem rótulo em português", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});

describe("menu administrativo", () => {
  it("todo item exige uma permissão", () => {
    // Item sem permissão apareceria para qualquer cargo administrativo.
    for (const item of ADMIN_NAV) {
      expect(Object.values(Permission)).toContain(item.permission);
    }
  });

  it("cargo sem a permissão não recebe o item no menu", () => {
    const visíveis = (role: (typeof ROLES)[number]) =>
      ADMIN_NAV.filter((item) => can({ id: "x", role }, item.permission)).map((item) => item.href);

    expect(visíveis("AUDITOR")).not.toContain("/admin/backup");
    expect(visíveis("SUPPORT")).not.toContain("/admin/backup");
    expect(visíveis("ADMIN")).not.toContain("/admin/backup");
    expect(visíveis("SUPER_ADMIN")).toContain("/admin/backup");
    expect(visíveis("USER")).toEqual([]);
  });
});

describe("adminRoles", () => {
  it("deriva a lista do mapa, sem repetir cargos à mão", () => {
    const roles = adminRoles();

    expect(roles).not.toContain("USER");
    expect([...roles].sort()).toEqual(
      ["ADMIN", "AUDITOR", "READ_ONLY", "SUPER_ADMIN", "SUPPORT"].sort(),
    );
  });
});

describe("autorização centralizada", () => {
  /**
   * A regra combinada com o dono do projeto: nenhuma comparação de cargo espalhada pelo
   * código. Se uma reaparecer, o build quebra aqui — revisão de código não pegaria sempre.
   */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });
  }

  it("não há comparação direta de cargo fora do módulo de permissões", () => {
    const permitidos = ["permissions.ts"];
    const suspeitas: string[] = [];

    for (const file of sourceFiles("src")) {
      if (permitidos.some((allowed) => file.endsWith(allowed))) continue;

      const linhas = readFileSync(file, "utf8").split("\n");
      linhas.forEach((linha, index) => {
        if (/role\s*[=!]==\s*["']/.test(linha)) suspeitas.push(`${file}:${index + 1}`);
      });
    }

    expect(suspeitas).toEqual([]);
  });
});
