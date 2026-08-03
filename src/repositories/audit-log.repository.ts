import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditFilters } from "@/types/audit";
import type { AuditCategory } from "@/constants/audit";

/**
 * Acesso à trilha de auditoria.
 *
 * **Só existe escrita por acréscimo.** Não há `update` nem `delete` aqui — não por
 * disciplina, mas por ausência: método que não existe não pode ser chamado por engano, e o
 * banco recusaria de qualquer forma, por trigger. Corrigir um registro é gravar outro.
 */

export interface AuditAppendInput {
  action: string;
  result?: "SUCCESS" | "FAILED";
  /** Quem sofreu a ação. */
  userId?: string | null;
  targetEmail?: string | null;
  /** Quem executou; igual ao alvo quando o próprio usuário agiu. */
  actorId?: string | null;
  actorEmail?: string | null;
  sessionId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  reason?: string | null;
  notes?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Prefixos por categoria — o filtro da tela traduz categoria em `startsWith`. */
const CATEGORY_PREFIXES: Record<AuditCategory, string[]> = {
  LOGIN: ["LOGIN", "LOGOUT", "SESSION_"],
  ACCOUNT: ["USER_", "EMAIL_", "NAME_", "PROFILE_", "ACCOUNT_", "REGISTER_"],
  PASSWORD: ["PASSWORD_"],
  TWO_FACTOR: ["TWO_FACTOR"],
  ADMIN: ["ADMIN_", "AUDIT_"],
};

/** User-agent chega a 500+ caracteres; o que identifica o cliente está no começo. */
const USER_AGENT_MAX = 200;

/**
 * Cliente do banco. Quase sempre o singleton da aplicação; o ensaio de restauração aponta
 * para um banco temporário, e é o que permite conferir a trilha *dentro do backup* com
 * exatamente o mesmo código que a confere em produção.
 */
type Db = Pick<PrismaClient, "auditLog" | "$queryRaw">;

export const auditLogRepository = {
  /** Único caminho de escrita. `seq`, `prevHash` e `hash` são preenchidos por trigger. */
  append(input: AuditAppendInput) {
    return prisma.auditLog.create({
      data: {
        action: input.action,
        result: input.result ?? "SUCCESS",
        userId: input.userId ?? null,
        targetEmail: input.targetEmail ?? null,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        sessionId: input.sessionId ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
      },
      select: { id: true, seq: true, hash: true },
    });
  },

  /**
   * Página da trilha por cursor.
   *
   * Cursor em vez de `OFFSET` porque o custo do offset cresce com a profundidade: na página
   * 500 o banco varreria 25 mil linhas para descartar 24.950. Com `seq` indexado e
   * monotônico, qualquer página custa o mesmo.
   */
  async listPage(filters: AuditFilters) {
    const where = buildWhere(filters, await matchingUserIds(filters.search));

    const rows = await prisma.auditLog.findMany({
      where: filters.cursor ? { ...where, seq: { lt: BigInt(filters.cursor) } } : where,
      orderBy: { seq: "desc" },
      take: filters.pageSize + 1,
    });

    const hasMore = rows.length > filters.pageSize;
    const page = hasMore ? rows.slice(0, filters.pageSize) : rows;

    return {
      rows: await withPeople(page),
      nextCursor: hasMore ? page[page.length - 1]!.seq.toString() : null,
    };
  },

  async count(filters: AuditFilters) {
    return prisma.auditLog.count({ where: buildWhere(filters, await matchingUserIds(filters.search)) });
  },

  /** Lote para exportação. O CSV/Excel usa os e-mails denormalizados. */
  async listForExport(filters: AuditFilters, limit: number) {
    const rows = await prisma.auditLog.findMany({
      where: buildWhere(filters, await matchingUserIds(filters.search)),
      orderBy: { seq: "desc" },
      take: limit,
    });

    return withPeople(rows);
  },

  /** Cabeça da cadeia — base do checkpoint e da verificação. */
  head() {
    return prisma.auditLog.findFirst({
      orderBy: { seq: "desc" },
      select: { seq: true, hash: true },
    });
  },

  total(client: Db = prisma) {
    return client.auditLog.count();
  },

  /**
   * Percorre a cadeia em blocos, do início ao fim, para a verificação de integridade.
   *
   * Devolve o **payload montado pelo próprio banco**, com a mesma expressão do trigger, em
   * vez das colunas soltas para a aplicação remontar. O motivo é um defeito real: `metadata`
   * é `jsonb`, e `jsonb::text` normaliza a saída — `{"a": 1}`, com espaço depois dos dois
   * pontos, ordem de chaves própria. `JSON.stringify` produz `{"a":1}`. Payload diferente,
   * hash diferente, e a verificação acusava adulteração em todo registro que tivesse
   * metadados.
   *
   * O mesmo raciocínio cobre o carimbo de tempo, cuja formatação depende do fuso da sessão.
   * Reproduzir essas regras em JavaScript seria refazer o Postgres — e errar de novo, mais
   * tarde, em silêncio.
   *
   * O `hash` continua sendo calculado fora do banco, em Node, sobre o texto recebido: o que
   * o banco faz aqui é renderizar colunas que ele já guarda, não atestar a própria trilha.
   * Registro alterado por dentro produz payload novo, que não bate com o hash gravado — a
   * detecção continua igual.
   *
   * `seq` e o hash anterior ficam de fora do texto de propósito: a verificação usa o hash do
   * registro que ela mesma acabou de conferir, não o `prevHash` guardado na linha, que é
   * justamente um dos campos que uma adulteração ajustaria.
   */
  chainSlice(afterSeq: bigint, limit: number, client: Db = prisma) {
    return client.$queryRaw<
      { seq: bigint; hash: string | null; createdAt: Date; payloadTail: string }[]
    >`
      SELECT
        "seq",
        "hash",
        "createdAt",
        concat_ws('|',
          "action",
          "result",
          coalesce("userId", ''),
          coalesce("actorId", ''),
          coalesce("targetEmail", ''),
          coalesce("actorEmail", ''),
          coalesce("sessionId", ''),
          coalesce("entity", ''),
          coalesce("entityId", ''),
          coalesce("reason", ''),
          coalesce("ipAddress", ''),
          coalesce("metadata"::text, ''),
          to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS')
        ) AS "payloadTail"
      FROM "audit_logs"
      WHERE "seq" > ${afterSeq}
      ORDER BY "seq" ASC
      LIMIT ${limit}
    `;
  },
};

/** Quantas contas a busca por nome resolve antes de virar filtro. */
const SEARCH_USER_LIMIT = 500;

type Person = { id: string; name: string | null; email: string };

/**
 * Contas cujo nome ou e-mail **atual** casa com a busca.
 *
 * Existe porque a trilha não tem mais relação com `users`: sem chave estrangeira não há
 * `where: { user: { name: ... } }`. Resolver os ids antes custa uma consulta indexada e
 * mantém a busca funcionando para quem trocou de e-mail depois do evento — caso em que o
 * e-mail denormalizado na linha guarda o endereço antigo, não o de hoje.
 */
async function matchingUserIds(search?: string): Promise<string[]> {
  if (!search) return [];

  const contains = { contains: search, mode: "insensitive" as const };
  const users = await prisma.user.findMany({
    where: { OR: [{ name: contains }, { email: contains }] },
    select: { id: true },
    take: SEARCH_USER_LIMIT,
  });

  return users.map((user) => user.id);
}

/**
 * Devolve as linhas com autor e alvo hidratados, no mesmo formato que o `include` produzia.
 *
 * Uma consulta para o lote inteiro, não uma por linha. Conta excluída simplesmente não
 * aparece no mapa e o campo fica nulo — que é exatamente o comportamento que o `SET NULL`
 * tentava dar, agora sem precisar escrever na trilha para consegui-lo.
 */
async function withPeople<T extends { userId: string | null; actorId: string | null }>(
  rows: T[],
): Promise<(T & { user: Person | null; actor: Person | null })[]> {
  const ids = [...new Set(rows.flatMap((row) => [row.userId, row.actorId]))].filter(
    (id): id is string => id !== null,
  );

  const people = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      })
    : [];

  const byId = new Map(people.map((person) => [person.id, person]));

  return rows.map((row) => ({
    ...row,
    user: row.userId ? (byId.get(row.userId) ?? null) : null,
    actor: row.actorId ? (byId.get(row.actorId) ?? null) : null,
  }));
}

/**
 * Filtro do Prisma a partir dos parâmetros da tela.
 *
 * Exportado para teste: é a parte com regra de verdade — categoria vira prefixo de ação,
 * busca cobre autor e alvo, período é inclusivo nas duas pontas — e a que quebraria em
 * silêncio, devolvendo resultado a menos sem ninguém perceber.
 *
 * Continua pura: os ids das contas que casam com a busca são resolvidos pelo repositório e
 * entram por parâmetro. Sem isso a função precisaria de banco, e a regra deixaria de ser
 * testável sem subir Postgres.
 */
export function buildWhere(
  filters: AuditFilters,
  matchedUserIds: string[] = [],
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  const and: Prisma.AuditLogWhereInput[] = [];

  if (filters.userId) {
    and.push({ OR: [{ userId: filters.userId }, { actorId: filters.userId }] });
  }

  if (filters.action) where.action = filters.action;

  if (filters.category) {
    and.push({
      OR: CATEGORY_PREFIXES[filters.category].map((prefix) => ({
        action: { startsWith: prefix },
      })),
    });
  }

  if (filters.result) where.result = filters.result;

  if (filters.search) {
    const contains = { contains: filters.search, mode: "insensitive" as const };
    and.push({
      OR: [
        // O e-mail gravado na linha é o do momento do evento; os ids cobrem quem trocou de
        // endereço depois. As duas formas juntas é o que a busca por relação fazia antes.
        { targetEmail: contains },
        { actorEmail: contains },
        ...(matchedUserIds.length > 0
          ? [{ userId: { in: matchedUserIds } }, { actorId: { in: matchedUserIds } }]
          : []),
      ],
    });
  }

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }

  if (and.length > 0) where.AND = and;
  return where;
}
