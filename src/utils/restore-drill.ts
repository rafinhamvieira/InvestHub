/**
 * Nome do banco do ensaio de restauração — puro, sem I/O.
 *
 * Isolado e testado porque é a última barreira antes de um `DROP DATABASE`. O ensaio cria um
 * banco, carrega o dump nele, confere e apaga; se o nome que chega ao `DROP` puder ser
 * qualquer coisa, o ensaio deixa de ser seguro e passa a ser a operação mais perigosa da
 * plataforma — exatamente o que ele existe para evitar.
 *
 * A regra é simples e fechada: só some um banco cujo nome esta função tenha gerado.
 */

/** Prefixo reservado. Nenhum banco de verdade deve começar assim. */
const DRILL_PREFIX = "investhub_ensaio_";

/** `investhub_ensaio_20260803T124500_a1b2c3` — carimbo para ordenar, sufixo contra colisão. */
export function buildDrillDatabaseName(reference = new Date(), suffix?: string): string {
  const stamp = reference.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
  const tail = suffix ?? Math.random().toString(36).slice(2, 8);

  return `${DRILL_PREFIX}${stamp}_${tail}`.toLowerCase();
}

/**
 * Verdadeiro só para nomes que `buildDrillDatabaseName` poderia ter produzido.
 *
 * Recusa aspas, espaço e qualquer coisa fora de letras minúsculas, dígitos e sublinhado —
 * o identificador vai para dentro de um comando SQL que não aceita parâmetro, então o
 * formato é a defesa contra injeção, não o driver.
 */
export function isDrillDatabaseName(name: string): boolean {
  return new RegExp(`^${DRILL_PREFIX}[a-z0-9_]+$`).test(name) && name.length <= 63;
}

/** Lança se o nome não for de ensaio. Usada imediatamente antes de criar e de apagar. */
export function assertDrillDatabase(name: string): void {
  if (!isDrillDatabaseName(name)) {
    throw new Error(`"${name}" não é um banco de ensaio; operação recusada.`);
  }
}

/** Mesma URL do banco da aplicação, apontando para outro banco. */
export function withDatabase(url: string, database: string): string {
  assertDrillDatabase(database);

  const [base, query] = url.split("?");
  const withoutDatabase = base!.slice(0, base!.lastIndexOf("/"));

  return `${withoutDatabase}/${database}${query ? `?${query}` : ""}`;
}
