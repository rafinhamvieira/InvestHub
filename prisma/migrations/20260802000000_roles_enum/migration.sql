-- Cargos novos do RBAC.
--
-- Migration separada de propósito: o Postgres não permite usar um valor de enum na mesma
-- transação em que ele é criado, e a migration seguinte já promove uma conta a SUPER_ADMIN.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'READ_ONLY';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AUDITOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPPORT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
