import { prisma } from "@/lib/prisma";
import { adminRoles } from "@/lib/permissions";

/**
 * Agregados da plataforma para o painel administrativo.
 *
 * **Este arquivo não toca em tabela financeira.** Nem para contar, nem para somar. A
 * primeira versão trazia patrimônio sob gestão, transações e proventos em forma agregada; o
 * dono do projeto recusou, e a recusa é a leitura certa: o total é feito do dinheiro de
 * pessoas que não autorizaram ninguém a somá-lo, e "agregado" só descreve a apresentação,
 * não a origem do dado. A promessa vale para o número tanto quanto para a linha.
 *
 * O que sobra é o tamanho do cadastro — informação de operação, já visível em `/admin/users`
 * — e a cobertura do catálogo de mercado, que é dado público de ativo, de ninguém.
 *
 * Dois testes vigiam este arquivo: um recusa qualquer acesso a modelo financeiro, outro
 * recusa consulta que devolva linhas em vez de contagem. Duas travas, porque a tentação de
 * "só mais um número" é permanente.
 *
 * Contagens distintas usam `groupBy` porque o Prisma não expõe `COUNT(DISTINCT)`.
 */

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

  /**
   * Avanço da rotação de dados de mercado. É o número que diz se vale assinar o plano pago
   * do provedor de fundamentos: com a cota gratuita, a cobertura sobe alguns pontos por dia.
   *
   * Catálogo de ativos é dado público — não pertence a nenhum usuário e não revela nada
   * sobre quem investe em quê.
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
