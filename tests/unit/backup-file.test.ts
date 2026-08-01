import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBackupName,
  formatBytes,
  isValidBackupName,
  resolveBackupPath,
} from "@/utils/backup-file";

const DIR = path.resolve("/backups");

describe("nome de arquivo de backup", () => {
  it("aceita os nomes gerados pelo sistema", () => {
    expect(isValidBackupName("investhub-20260801-0300.sql.gz")).toBe(true);
    expect(isValidBackupName("investhub-manual-20260801-131500.sql.gz")).toBe(true);
    expect(isValidBackupName("pre-migracao-2026-08-01-1300.sql.gz")).toBe(true);
  });

  it("recusa qualquer coisa que não seja um dump", () => {
    expect(isValidBackupName(".env")).toBe(false);
    expect(isValidBackupName("dump.sql")).toBe(false);
    expect(isValidBackupName("")).toBe(false);
    expect(isValidBackupName(`${"a".repeat(200)}.sql.gz`)).toBe(false);
  });

  it("recusa travessia de diretório em todas as formas", () => {
    expect(isValidBackupName("../.env")).toBe(false);
    expect(isValidBackupName("../../etc/passwd")).toBe(false);
    expect(isValidBackupName("..%2f..%2fetc%2fpasswd")).toBe(false);
    expect(isValidBackupName("/etc/passwd")).toBe(false);
    expect(isValidBackupName("..\\..\\windows\\system32")).toBe(false);
    expect(isValidBackupName("sub/dir/backup.sql.gz")).toBe(false);
  });
});

describe("resolução de caminho", () => {
  it("devolve o caminho dentro da pasta de backups", () => {
    const resolved = resolveBackupPath(DIR, "investhub-20260801-0300.sql.gz");
    expect(resolved).toBe(path.join(DIR, "investhub-20260801-0300.sql.gz"));
  });

  it("nunca escapa da pasta, mesmo com nome malicioso", () => {
    // Segunda barreira: se a expressão regular um dia deixar passar, o caminho resolvido
    // ainda precisa continuar dentro da base.
    expect(resolveBackupPath(DIR, "../secrets.sql.gz")).toBeNull();
    expect(resolveBackupPath(DIR, "../../root/.ssh/id_rsa")).toBeNull();
    expect(resolveBackupPath(DIR, "/etc/shadow")).toBeNull();
  });

  it("recusa o próprio diretório como alvo", () => {
    expect(resolveBackupPath(DIR, ".")).toBeNull();
    expect(resolveBackupPath(DIR, "")).toBeNull();
  });
});

describe("nome gerado sob demanda", () => {
  it("carimba data e hora em UTC e passa na própria validação", () => {
    const name = buildBackupName(new Date("2026-08-01T13:15:00.000Z"));
    expect(name).toBe("investhub-manual-20260801-131500.sql.gz");
    expect(isValidBackupName(name)).toBe(true);
  });
});

describe("tamanho legível", () => {
  it("converte para a unidade adequada", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3 GB");
  });
});
