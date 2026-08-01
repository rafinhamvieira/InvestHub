import { createCipheriv, createDecipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AUTH_TAG_LENGTH,
  CIPHER_ALGORITHM,
  buildHeader,
  createIv,
  createSalt,
  deriveKey,
  encryptedName,
  parseHeader,
} from "@/utils/backup-crypto";

/** Reproduz o que a rota de download faz, sem servidor no meio. */
async function encrypt(plain: Buffer, password: string): Promise<Buffer> {
  const salt = createSalt();
  const iv = createIv();
  const key = await deriveKey(password, salt);
  const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv);

  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([buildHeader(salt, iv), body, cipher.getAuthTag()]);
}

async function decrypt(file: Buffer, password: string): Promise<Buffer> {
  const header = parseHeader(file);
  if (!header) throw new Error("cabeçalho inválido");

  const authTag = file.subarray(file.length - AUTH_TAG_LENGTH);
  const body = file.subarray(header.offset, file.length - AUTH_TAG_LENGTH);

  const key = await deriveKey(password, header.salt);
  const decipher = createDecipheriv(CIPHER_ALGORITHM, key, header.iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(body), decipher.final()]);
}

const CONTEUDO = Buffer.from("dump do banco com dados de todos os usuários");
const SENHA = "senha-bem-longa-123";

describe("cifragem do backup", () => {
  it("volta ao conteúdo original com a senha certa", async () => {
    const file = await encrypt(CONTEUDO, SENHA);
    expect(await decrypt(file, SENHA)).toEqual(CONTEUDO);
  });

  it("não deixa o conteúdo aparecer no arquivo cifrado", async () => {
    const file = await encrypt(CONTEUDO, SENHA);
    expect(file.includes("dump do banco")).toBe(false);
  });

  it("recusa a senha errada", async () => {
    const file = await encrypt(CONTEUDO, SENHA);
    await expect(decrypt(file, "outra-senha-longa")).rejects.toThrow();
  });

  it("detecta adulteração do conteúdo", async () => {
    // AES-GCM autentica: byte trocado no meio falha na conferência em vez de devolver lixo.
    const file = await encrypt(CONTEUDO, SENHA);
    file[40] = file[40]! ^ 0xff;
    await expect(decrypt(file, SENHA)).rejects.toThrow();
  });

  it("usa sal e IV diferentes a cada arquivo", async () => {
    const primeiro = await encrypt(CONTEUDO, SENHA);
    const segundo = await encrypt(CONTEUDO, SENHA);

    // Mesmo conteúdo e mesma senha não podem gerar bytes iguais: repetição de IV em GCM
    // é falha grave, permite recuperar o texto original comparando dois arquivos.
    expect(primeiro.equals(segundo)).toBe(false);
  });
});

describe("cabeçalho", () => {
  it("rejeita arquivo que não é deste formato", () => {
    expect(parseHeader(Buffer.from("qualquer coisa aleatória aqui"))).toBeNull();
    expect(parseHeader(Buffer.alloc(3))).toBeNull();
  });

  it("acrescenta .enc ao nome baixado", () => {
    expect(encryptedName("investhub-20260801-0300.sql.gz")).toBe(
      "investhub-20260801-0300.sql.gz.enc",
    );
  });
});
