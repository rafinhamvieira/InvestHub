import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Permission, ROLE_PERMISSIONS, can, hasAdminAccess } from "@/lib/permissions";
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

  it("nega quando não há principal", () => {
    expect(can(null, Permission.VIEW_AUDIT)).toBe(false);
    expect(can(undefined, Permission.VIEW_AUDIT)).toBe(false);
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
