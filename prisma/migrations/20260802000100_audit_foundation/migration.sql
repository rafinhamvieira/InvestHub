-- Fundação da Etapa 1: auditoria imutável e encadeada, mais registro de sessões.
--
-- Motivo: a trilha de auditoria precisa ser prova, não relatório. Sem imutabilidade no
-- banco, "append-only" seria só uma promessa do código da aplicação — qualquer caminho de
-- escrita futuro poderia violá-la sem que ninguém percebesse.

CREATE TYPE "SessionType" AS ENUM ('WEB', 'MOBILE', 'API');

-- ------------------------------------------------------------
-- Sessões
--
-- O Auth.js opera com JWT, que não guarda estado. Sem este registro não há como listar
-- sessões, revogar acesso nem correlacionar eventos de auditoria a um mesmo acesso.
-- ------------------------------------------------------------
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SessionType" NOT NULL DEFAULT 'WEB',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "location" TEXT,
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revocationReason" TEXT,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

COMMENT ON COLUMN "user_sessions"."location" IS 'Cidade/região aproximada; preenchida apenas quando há provedor de geolocalização configurado.';
COMMENT ON COLUMN "user_sessions"."revocationReason" IS 'Por que a sessão foi encerrada: logout, revogação pelo próprio usuário ou por administrador.';

-- Sessão pertence à conta: apagar a conta apaga as sessões dela. Trilha de auditoria é o
-- que nunca desaparece — sessão é estado corrente, não registro histórico.
ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Filtros da tela: sessões ativas de um usuário e expurgo das vencidas.
CREATE INDEX "user_sessions_userId_revokedAt_idx" ON "user_sessions"("userId", "revokedAt");
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions"("expiresAt");

ALTER TABLE "users" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);
COMMENT ON COLUMN "users"."sessionsValidFrom" IS 'Tokens emitidos antes desta data deixam de valer — invalidação em bloco sem estado por token.';

-- ------------------------------------------------------------
-- 3. Auditoria
-- ------------------------------------------------------------
ALTER TABLE "audit_logs" ADD COLUMN "seq" BIGSERIAL;
ALTER TABLE "audit_logs" ADD COLUMN "result" TEXT NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE "audit_logs" ADD COLUMN "targetEmail" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "actorId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "actorEmail" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "reason" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "notes" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "hash" TEXT;

COMMENT ON COLUMN "audit_logs"."seq" IS 'Ordem monotônica: buraco na sequência é evidência de remoção.';
COMMENT ON COLUMN "audit_logs"."actorEmail" IS 'E-mail de quem executou, denormalizado — a linha precisa continuar legível depois que a conta for excluída.';
COMMENT ON COLUMN "audit_logs"."reason" IS 'Justificativa; obrigatória nas ações classificadas como críticas.';
COMMENT ON COLUMN "audit_logs"."hash" IS 'sha256(seq || prevHash || payload) calculado por trigger — encadeia o registro ao anterior.';

CREATE UNIQUE INDEX "audit_logs_seq_key" ON "audit_logs"("seq");

-- Chaves estrangeiras com SET NULL, nunca CASCADE: excluir uma conta não pode apagar o
-- histórico do que ela fez. RESTRICT foi descartado porque impediria excluir qualquer
-- conta que já tivesse gerado log — inclusive cadastros não confirmados.
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Índices espelham exatamente os filtros da tela de auditoria.
CREATE INDEX "audit_logs_createdAt_desc_idx" ON "audit_logs"("createdAt" DESC);
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt" DESC);
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt" DESC);
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt" DESC);
CREATE INDEX "audit_logs_sessionId_idx" ON "audit_logs"("sessionId");

-- ------------------------------------------------------------
-- 4. Cadeia de integridade
--
-- Calculada no banco, e não na aplicação, para valer em qualquer caminho de escrita —
-- inclusive um INSERT manual no psql. O advisory lock serializa a leitura da cabeça da
-- cadeia: sem ele, dois INSERTs simultâneos encadeariam no mesmo antecessor e a
-- verificação acusaria quebra onde não houve adulteração.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION audit_logs_chain() RETURNS TRIGGER AS $$
DECLARE
  last_hash TEXT;
  payload TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_logs_chain'));

  SELECT "hash" INTO last_hash
  FROM "audit_logs"
  ORDER BY "seq" DESC
  LIMIT 1;

  NEW."prevHash" := last_hash;

  payload := concat_ws('|',
    NEW."seq",
    coalesce(last_hash, ''),
    NEW."action",
    NEW."result",
    coalesce(NEW."userId", ''),
    coalesce(NEW."actorId", ''),
    coalesce(NEW."targetEmail", ''),
    coalesce(NEW."actorEmail", ''),
    coalesce(NEW."sessionId", ''),
    coalesce(NEW."entity", ''),
    coalesce(NEW."entityId", ''),
    coalesce(NEW."reason", ''),
    coalesce(NEW."ipAddress", ''),
    coalesce(NEW."metadata"::text, ''),
    to_char(NEW."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS')
  );

  NEW."hash" := encode(digest(payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_chain_trigger
  BEFORE INSERT ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_chain();

-- Imutabilidade: nem a aplicação, nem um script, nem um psql aberto por engano alteram a
-- trilha. Correção de registro errado é registro novo.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs é append-only: % não é permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- ------------------------------------------------------------
-- 5. Âncoras da cadeia
--
-- O HMAC usa chave que vive só no ambiente da aplicação. Recalcular a cadeia inteira para
-- esconder um evento exigiria comprometer banco e variáveis de ambiente ao mesmo tempo.
-- ------------------------------------------------------------
CREATE TABLE "audit_checkpoints" (
    "id" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "headHash" TEXT NOT NULL,
    "hmac" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_checkpoints_seq_idx" ON "audit_checkpoints"("seq");

-- ------------------------------------------------------------
-- 6. Conta responsável pela plataforma
-- ------------------------------------------------------------
UPDATE "users" SET "role" = 'SUPER_ADMIN' WHERE "email" = 'rafacorreavieira2020@gmail.com';

-- TRUNCATE não dispara trigger de linha: sem esta guarda, um comando apagaria a trilha
-- inteira sem esbarrar em nada. A exceção controlada existe para o banco de teste poder
-- limpar entre casos — em produção a variável nunca é definida.
CREATE OR REPLACE FUNCTION audit_logs_no_truncate() RETURNS TRIGGER AS $$
BEGIN
  IF coalesce(current_setting('app.allow_audit_truncate', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'audit_logs é append-only: TRUNCATE não é permitido'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_no_truncate();
