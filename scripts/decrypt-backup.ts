/**
 * Decifra um backup baixado pelo painel administrativo.
 *
 *   npx tsx scripts/decrypt-backup.ts investhub-20260801-0300.sql.gz.enc "senha"
 *
 * Roda na sua máquina, não no servidor — o arquivo cifrado só existe depois de baixado.
 * Sem dependência nenhuma além do Node: o formato é o mesmo descrito em
 * `src/utils/backup-crypto.ts`.
 *
 * Saída: o `.sql.gz` original, pronto para restaurar com
 *   gunzip -c arquivo.sql.gz | psql -U investhub -d investhub
 */
import { createDecipheriv } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  AUTH_TAG_LENGTH,
  CIPHER_ALGORITHM,
  deriveKey,
  parseHeader,
} from "../src/utils/backup-crypto";

async function main() {
  const [input, password] = process.argv.slice(2);

  if (!input || !password) {
    console.error('Uso: tsx scripts/decrypt-backup.ts arquivo.sql.gz.enc "senha"');
    process.exit(1);
  }

  const buffer = await readFile(input);
  const header = parseHeader(buffer);
  if (!header) {
    console.error("Arquivo não parece um backup cifrado pelo InvestHub.");
    process.exit(1);
  }

  const authTag = buffer.subarray(buffer.length - AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(header.offset, buffer.length - AUTH_TAG_LENGTH);

  const key = await deriveKey(password, header.salt);
  const decipher = createDecipheriv(CIPHER_ALGORITHM, key, header.iv);
  decipher.setAuthTag(authTag);

  let plain: Buffer;
  try {
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // O AES-GCM não distingue senha errada de arquivo adulterado — os dois falham aqui.
    console.error("Falha ao decifrar: senha incorreta ou arquivo corrompido.");
    process.exit(1);
  }

  const output = input.replace(/\.enc$/, "");
  await writeFile(output, plain);
  console.log(`Backup decifrado em ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
