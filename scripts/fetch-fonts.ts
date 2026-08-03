/**
 * Baixa as fontes do Google e as grava em `src/fonts/`.
 *
 * Roda **uma vez**, quando as fontes mudarem. Os `.woff2` são versionados de propósito: o
 * `next/font/google` buscava os arquivos a cada `next build`, e um build que depende de DNS
 * quebra por motivo que nada tem a ver com o código — já aconteceu duas vezes em produção,
 * uma no `prisma generate` e outra aqui, derrubando o deploy nas duas.
 *
 * Só o subconjunto `latin` é trazido. Ele cobre o Latin-1 Supplement, ou seja, todo o
 * português (á, ã, ç, õ, ê). Os demais subconjuntos que o Google serve — cirílico, grego,
 * vietnamita — seriam centenas de kB para nunca desenhar um glifo.
 *
 * Uso: npx tsx scripts/fetch-fonts.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** O Google decide o formato pelo user-agent: sem um moderno, ele devolve TTF. */
const MODERN_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";

const OUTPUT_DIR = path.join(process.cwd(), "src", "fonts");

const FONTS = [
  { file: "inter-latin.woff2", query: "Inter:wght@100..900" },
  { file: "jetbrains-mono-latin.woff2", query: "JetBrains+Mono:wght@100..800" },
];

/**
 * Extrai a URL do subconjunto pedido.
 *
 * A folha do Google vem com um comentário nomeando cada bloco (`/* latin *​/`) antes do
 * `@font-face` correspondente. É por esse marcador que se escolhe o subconjunto — a
 * alternativa seria comparar `unicode-range`, que muda com mais frequência.
 */
function extractSubsetUrl(css: string, subset: string): string {
  const blocks = css.split("/*").map((block) => block.trim());
  const target = blocks.find((block) => block.startsWith(`${subset} */`));

  if (!target) throw new Error(`Subconjunto "${subset}" não encontrado na folha de estilo.`);

  const url = target.match(/src:\s*url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
  if (!url) throw new Error(`Nenhum woff2 no bloco "${subset}".`);

  return url;
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const font of FONTS) {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${font.query}&display=swap`;
    const css = await fetch(cssUrl, { headers: { "User-Agent": MODERN_BROWSER } });
    if (!css.ok) throw new Error(`Falha ao buscar a folha de ${font.query}: ${css.status}`);

    const fontUrl = extractSubsetUrl(await css.text(), "latin");
    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error(`Falha ao baixar ${fontUrl}: ${response.status}`);

    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path.join(OUTPUT_DIR, font.file), bytes);

    console.warn(`${font.file} — ${(bytes.length / 1024).toFixed(0)} kB`);
  }

  console.warn("Pronto. Versione os arquivos: é o que mantém o build sem rede.");
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
