-- Série histórica de saúde da plataforma.
--
-- O resumo da Etapa 2 responde "como está agora". Esta tabela responde "como esteve" — que
-- é a pergunta de quem chega depois do incidente, e a única forma de distinguir uma
-- lentidão pontual de uma degradação que vem piorando há dias.
--
-- A coleta pega carona no `/api/health`, chamado a cada 15 segundos pelo healthcheck do
-- Docker, com uma amostra gravada a cada poucos minutos. Nenhum agendador novo.
--
-- Volume: uma amostra a cada 5 minutos são ~288 por dia e ~105 mil por ano, com expurgo por
-- idade. É desprezível perto de `asset_prices`.

CREATE TABLE "health_samples" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "databaseMs" INTEGER,
    "cacheMs" INTEGER,
    "syncAgeHours" DOUBLE PRECISION,
    "syncFailures" INTEGER NOT NULL DEFAULT 0,
    "backupAgeHours" DOUBLE PRECISION,
    "coverage" DOUBLE PRECISION,
    "uptimeSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "health_samples_pkey" PRIMARY KEY ("id")
);

-- Todas as leituras são por janela de tempo — "últimas 24h", "últimos 30 dias".
CREATE INDEX "health_samples_createdAt_idx" ON "health_samples"("createdAt");

COMMENT ON TABLE "health_samples" IS 'Amostras periódicas de saúde. Buraco na série é registro de indisponibilidade: com o banco fora do ar não há como gravar a amostra que diria isso.';
COMMENT ON COLUMN "health_samples"."databaseMs" IS 'Nulo quando a sondagem falhou — o que, para o banco, significa que a amostra provavelmente nem chegou a ser gravada.';
COMMENT ON COLUMN "health_samples"."uptimeSeconds" IS 'Queda no valor entre amostras consecutivas denuncia reinício do processo.';
