import { prisma } from "@/lib/prisma";
import { adminRoles } from "@/lib/permissions";

/**
 * Agregados da plataforma para o painel administrativo.
 *
 * Tudo aqui é `COUNT` e `SUM` — nenhuma consulta devolve linha de usuário. A separação é
 * deliberada: a tela de números não deve ser capaz de virar uma listagem de pessoas por
 * descuido de quem mexer nela depois.
 *
 * Contagens distintas usam `groupBy` porque o Prisma não expõe `COUNT(DISTINCT)`. O custo é
 * trazer as chaves para a aplicação; nas ordens de grandeza desta base (milhares de
 * posições) sai mais barato que manter SQL cru, que perderia a checagem de tipos do schema.
 */

/** Posição encerrada continua na tabela com quantidade zero; ela não conta como carteira. */
const OPEN_POSITION = { quantity: { gt: 0 } } as const;

export const adminMetricsRepository = {
  async users(since7d: Date, since30d: Date) {
    const [total, new7d, new30d, unverified, twoFactor, staff, activeSessions] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: since7d } } }),
      prisma.user.count({ where: { createdAt: { gte: since30d } } }),
      prisma.user.count({ where: { emailVerified: null } }),
      prisma.user.count({ where: { twoFactorEnabled: true } }),
      // Nunca `role: "ADMIN"`: quem define o que é equipe é o mapa de permissões.
      prisma.user.count({ where: { role: { in: adminRoles() } } }),
      prisma.userSession.groupBy({
        by: ["userId"],
        where: { revokedAt: null, lastSeenAt: { gte: since30d } },
      }),
    ]);

    return { total, new7d, new30d, unverified, twoFactor, staff, active30d: activeSessions.length };
  },

  async portfolio(since30d: Date) {
    const [investors, invested, positions, assetsHeld, transactions, transactions30d] =
      await Promise.all([
        prisma.position.groupBy({ by: ["userId"], where: OPEN_POSITION }),
        prisma.position.aggregate({ _sum: { totalInvested: true }, where: OPEN_POSITION }),
        prisma.position.count({ where: OPEN_POSITION }),
        prisma.position.groupBy({ by: ["assetId"], where: OPEN_POSITION }),
        prisma.transaction.count(),
        prisma.transaction.count({ where: { date: { gte: since30d } } }),
      ]);

    return {
      investors: investors.length,
      totalInvested: Number(invested._sum.totalInvested ?? 0),
      positions,
      assetsHeld: assetsHeld.length,
      transactions,
      transactions30d,
    };
  },

  /**
   * O recibo é criado no dia em que o provento cai na carteira, então `createdAt` é a data
   * do crédito — não a de anúncio nem a de ex-dividendo. É a leitura que responde "quanto a
   * base recebeu no último ano".
   */
  async dividends(since12m: Date, now: Date, until30d: Date) {
    const [received, upcoming] = await Promise.all([
      prisma.dividendReceipt.aggregate({
        _sum: { totalReceived: true },
        _count: true,
        where: { createdAt: { gte: since12m } },
      }),
      prisma.assetDividend.count({
        where: {
          paymentDate: { gte: now, lte: until30d },
          asset: { positions: { some: OPEN_POSITION } },
        },
      }),
    ]);

    return {
      received12m: Number(received._sum.totalReceived ?? 0),
      receipts12m: received._count,
      upcoming30d: upcoming,
    };
  },

  async fixedIncome() {
    const where = { ...OPEN_POSITION, asset: { fixedIncomeTerms: { isNot: null } } };

    const [holders, titles, invested] = await Promise.all([
      prisma.position.groupBy({ by: ["userId"], where }),
      prisma.position.groupBy({ by: ["assetId"], where }),
      prisma.position.aggregate({ _sum: { totalInvested: true }, where }),
    ]);

    return {
      holders: holders.length,
      titles: titles.length,
      invested: Number(invested._sum.totalInvested ?? 0),
    };
  },

  /**
   * Avanço da rotação de dados de mercado. É o número que diz se vale assinar o plano pago
   * do provedor de fundamentos: com a cota gratuita, a cobertura sobe alguns pontos por dia.
   */
  async coverage() {
    const active = { isActive: true } as const;

    const [activeAssets, withFundamentals, withDividends] = await Promise.all([
      prisma.asset.count({ where: active }),
      prisma.asset.count({ where: { ...active, fundamentals: { some: {} } } }),
      prisma.asset.count({ where: { ...active, dividends: { some: {} } } }),
    ]);

    return { activeAssets, withFundamentals, withDividends };
  },
};
