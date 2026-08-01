-- Promove a conta do responsável pela plataforma a administrador.
--
-- Idempotente e sem efeito se a conta ainda não existir: a migração roda em qualquer
-- ambiente (inclusive banco de teste vazio) sem falhar. Novos administradores devem ser
-- promovidos por `scripts/set-admin.ts`, que registra a mudança na trilha de auditoria.
UPDATE "users" SET "role" = 'ADMIN' WHERE "email" = 'rafacorreavieira2020@gmail.com';
