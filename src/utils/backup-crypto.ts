/**
 * Criptografia dos backups baixados pelo painel.
 *
 * O dump sai do servidor cifrado com uma senha que o administrador digita na hora e que
 * **nunca é gravada** — nem em disco, nem em log, nem em variável de ambiente. Se a senha
 * ficasse guardada junto da aplicação, o arquivo cifrado protegeria contra quase nada: quem
 * tivesse acesso ao servidor teria os dois.
 *
 * A cifragem acontece no download, não na geração. Assim vale para todo arquivo — inclusive
 * os dumps automáticos, que são gerados por um container sem senha nenhuma — e o que
 * atravessa a rede e pousa no seu computador está sempre protegido.
 *
 * Formato do arquivo:
 *
 *   "IHBK1" | salt (16B) | iv (12B) | ciphertext… | authTag (16B)
 *
 * AES-256-GCM detecta adulteração: arquivo corrompido ou modificado falha na conferência do
 * `authTag` em vez de devolver lixo silenciosamente. A chave sai de scrypt sobre a senha,
 * que torna a tentativa de força bruta cara mesmo com uma senha mediana.
 */

import { scrypt as scryptCallback, randomBytes, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

// `promisify` perde a sobrecarga com opções; o tipo explícito recupera os quatro argumentos.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

export const MAGIC = Buffer.from("IHBK1");
export const SALT_LENGTH = 16;
export const IV_LENGTH = 12;
export const AUTH_TAG_LENGTH = 16;
export const KEY_LENGTH = 32;
export const CIPHER_ALGORITHM = "aes-256-gcm";

/** Custo do scrypt: ~100ms por derivação, suficiente para atrapalhar força bruta. */
const SCRYPT_COST = 2 ** 15;

export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  // O scrypt precisa de ~128 × N × r bytes (aqui, 32 MB) e o padrão do Node é exatamente
  // 32 MB — o limite estoura na borda. Damos o dobro de folga.
  return scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: 8,
    p: 1,
    maxmem: 128 * SCRYPT_COST * 8 * 2,
  });
}

export function createSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

export function createIv(): Buffer {
  return randomBytes(IV_LENGTH);
}

/** Cabeçalho que precede o conteúdo cifrado. */
export function buildHeader(salt: Buffer, iv: Buffer): Buffer {
  return Buffer.concat([MAGIC, salt, iv]);
}

export interface ParsedHeader {
  salt: Buffer;
  iv: Buffer;
  /** Onde o conteúdo cifrado começa. */
  offset: number;
}

/** Lê o cabeçalho de um arquivo cifrado; `null` quando não é um backup deste formato. */
export function parseHeader(buffer: Buffer): ParsedHeader | null {
  const headerLength = MAGIC.length + SALT_LENGTH + IV_LENGTH;
  if (buffer.length < headerLength) return null;
  if (!buffer.subarray(0, MAGIC.length).equals(MAGIC)) return null;

  return {
    salt: buffer.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH),
    iv: buffer.subarray(MAGIC.length + SALT_LENGTH, headerLength),
    offset: headerLength,
  };
}

/** Nome do arquivo entregue ao navegador. */
export function encryptedName(name: string): string {
  return `${name}.enc`;
}
