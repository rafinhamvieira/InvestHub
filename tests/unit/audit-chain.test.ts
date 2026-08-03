import { describe, expect, it, vi } from "vitest";

// Os repositórios só são tocados por `verify()`, que não entra neste arquivo — mas importar
// o serviço carregaria o cliente Prisma junto. As funções sob teste são puras.
vi.mock("@/repositories/audit-log.repository", () => ({ auditLogRepository: {} }));
vi.mock("@/repositories/audit-checkpoint.repository", () => ({ auditCheckpointRepository: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { computeHash, initialChainState, walkChain } = await import(
  "@/services/audit-integrity.service"
);

type Row = Parameters<typeof computeHash>[0];

function linha(seq: bigint, overrides: Partial<Row> = {}): Row {
  return {
    seq,
    hash: null,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    // O banco entrega este texto pronto; para a caminhada, ele é opaco.
    payloadTail: `LOGIN_SUCCESS|SUCCESS|u1|||||||||2026-08-01T10:00:00.000`,
    ...overrides,
  } as Row;
}

/** Encadeia as linhas como o trigger do banco faria, do primeiro ao último. */
function encadear(rows: Row[], prevHash: string | null = null): Row[] {
  let anterior = prevHash;

  return rows.map((row) => {
    const encadeada = { ...row, hash: computeHash(row, anterior) };
    anterior = encadeada.hash;
    return encadeada;
  });
}

describe("caminhada da cadeia de auditoria", () => {
  it("aceita uma trilha inteiramente encadeada", () => {
    const state = walkChain(encadear([linha(1n), linha(2n), linha(3n)]), initialChainState());

    expect(state.firstInvalidRecord).toBeNull();
    expect(state.missingSequences).toEqual([]);
    expect(state.unchainedRecords).toBe(0);
  });

  it("registro anterior à cadeia não é adulteração", () => {
    // O caso real de produção: a tabela existia antes da migração que criou o trigger, e as
    // colunas de hash entraram vazias. Verificar esses registros acusava quebra no nº 1.
    const antigos = [linha(1n), linha(2n)];
    const novos = encadear([linha(3n), linha(4n)]);

    const state = walkChain([...antigos, ...novos], initialChainState());

    expect(state.unchainedRecords).toBe(2);
    expect(state.firstInvalidRecord).toBeNull();
  });

  it("hash vazio depois do início da cadeia continua sendo divergência", () => {
    // O trigger não tem como produzir isso, e o banco recusa UPDATE: se aconteceu, é grave.
    const [encadeada] = encadear([linha(1n)]);
    const state = walkChain([encadeada!, linha(2n)], initialChainState());

    expect(state.unchainedRecords).toBe(0);
    expect(state.firstInvalidRecord?.seq).toBe("2");
    expect(state.firstInvalidRecord?.foundHash).toBeNull();
  });

  it("aponta o primeiro registro alterado", () => {
    const rows = encadear([linha(1n), linha(2n), linha(3n)]);
    // Alterar o IP sem recalcular o hash é exatamente o que a cadeia existe para revelar.
    rows[1] = {
      ...rows[1]!,
      payloadTail: rows[1]!.payloadTail.replace("|u1|", "|u1|10.0.0.9|"),
    };

    const state = walkChain(rows, initialChainState());

    expect(state.firstInvalidRecord?.seq).toBe("2");
    expect(state.firstInvalidRecord?.foundHash).toBe(rows[1]!.hash);
    expect(state.firstInvalidRecord?.expectedHash).not.toBe(rows[1]!.hash);
  });

  it("denuncia buraco na sequência mesmo com a cadeia coerente", () => {
    const rows = encadear([linha(1n), linha(4n)]);

    const state = walkChain(rows, initialChainState());

    expect(state.missingSequences).toEqual(["2", "3"]);
    expect(state.firstInvalidRecord).toBeNull();
  });

  it("o resultado não depende de como os lotes foram divididos", () => {
    const rows = encadear([linha(1n), linha(2n), linha(3n), linha(4n)]);

    const inteiro = walkChain(rows, initialChainState());
    const partido = walkChain(rows.slice(2), walkChain(rows.slice(0, 2), initialChainState()));

    expect(partido.firstInvalidRecord).toEqual(inteiro.firstInvalidRecord);
    expect(partido.missingSequences).toEqual(inteiro.missingSequences);
    expect(partido.cursor).toBe(inteiro.cursor);
  });

  it("o prefixo antigo não desloca o cursor nem some da contagem entre lotes", () => {
    const antigos = [linha(1n), linha(2n)];
    const novos = encadear([linha(3n)]);

    const state = walkChain(novos, walkChain(antigos, initialChainState()));

    expect(state.unchainedRecords).toBe(2);
    expect(state.chainStarted).toBe(true);
    expect(state.cursor).toBe(3n);
    expect(state.firstInvalidRecord).toBeNull();
  });

  it("não altera o estado recebido", () => {
    const inicial = initialChainState();
    walkChain(encadear([linha(1n)]), inicial);

    expect(inicial.cursor).toBe(0n);
    expect(inicial.missingSequences).toEqual([]);
  });
});
