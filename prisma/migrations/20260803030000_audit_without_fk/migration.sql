-- A trilha de auditoria deixa de ter chave estrangeira para `users`.
--
-- Motivo: as duas garantias que o projeto assumiu eram incompatíveis entre si, e a
-- contradição só apareceu quando a suíte de integração passou a rodar de verdade.
--
--  * `ON DELETE SET NULL` faz o Postgres **atualizar** `audit_logs` ao excluir uma conta;
--  * o trigger de imutabilidade recusa qualquer UPDATE na tabela.
--
-- O resultado era que nenhuma conta com histórico de auditoria podia ser excluída — o que
-- inclui toda conta que já se cadastrou, porque o cadastro em si gera registro. A limpeza
-- de cadastros não confirmados falhava a cada ciclo, engolida por um `try/catch` cujo log
-- ninguém lê.
--
-- Permitir o UPDATE não resolveria: `userId` e `actorId` entram no payload assinado, então
-- anulá-los quebraria a cadeia de hash e a verificação passaria a acusar adulteração onde
-- houve apenas o exercício de um direito do usuário.
--
-- A chave estrangeira era elegância referencial paga com mutabilidade numa tabela que se
-- define por não ser mutável. Sai ela. As colunas continuam guardando o id, e o e-mail
-- denormalizado — que existe desde o início exatamente para isto — mantém o registro
-- legível depois que a conta some.

ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_userId_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actorId_fkey";

COMMENT ON COLUMN "audit_logs"."userId" IS 'Id de quem sofreu a ação. Sem chave estrangeira de propósito: a trilha não pode ser alterada nem quando a conta é excluída. O e-mail denormalizado é o que mantém a linha legível.';
COMMENT ON COLUMN "audit_logs"."actorId" IS 'Id de quem executou. Sem chave estrangeira, pelo mesmo motivo do userId.';
