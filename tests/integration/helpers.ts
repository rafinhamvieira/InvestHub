import { PrismaClient } from "@prisma/client";

/**
 * Utilidades dos testes de integração.
 *
 * O banco é apontado por `TEST_DATABASE_URL` e **nunca** pelo `DATABASE_URL` de verdade —
 * a limpeza entre testes apaga tabelas inteiras, e um engano aqui custaria a carteira do
 * usuário. Sem a variável, os testes se declaram ignorados.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasDatabase = Boolean(TEST_DATABASE_URL);

export const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL ?? "postgresql://invalid" } },
});

/** Apaga os dados na ordem das dependências. Roda antes de cada teste. */
export async function resetDatabase(): Promise<void> {
  // A trilha de auditoria recusa TRUNCATE por trigger; o banco de teste abre a exceção
  // explicitamente. Em produção esta variável nunca é definida.
  await prisma.$executeRawUnsafe(`SELECT set_config('app.allow_audit_truncate', 'on', false)`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      dividend_receipts, asset_dividends, asset_prices, asset_fundamentals,
      fixed_income_terms, transactions, positions, allocation_targets,
      audit_checkpoints, user_sessions, audit_logs, login_audits,
      watchlist_items, watchlists, alerts, notifications, brokers, assets, users
    RESTART IDENTITY CASCADE
  `);
}

export async function createUser(email = "teste@investhub.local") {
  return prisma.user.create({
    data: { email, name: "Teste", passwordHash: "x", emailVerified: new Date() },
  });
}
