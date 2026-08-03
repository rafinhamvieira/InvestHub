-- Parâmetros da plataforma ajustáveis pelo painel.
--
-- A tabela guarda apenas a diferença em relação ao padrão: só existe linha para o que foi
-- alterado, e apagar a linha devolve o valor do `.env` ou do código. Isso mantém o `.env`
-- como base e evita o problema clássico de configuração em banco — a tabela que, uma vez
-- populada, passa a esconder de onde o valor realmente vem.
--
-- O que é ajustável, com rótulo e limites, vive em `src/config/platform-settings.ts`. Aqui
-- não há como saber se um valor faz sentido; a validação é da aplicação.

CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

COMMENT ON TABLE "platform_settings" IS 'Só a diferença em relação ao padrão: linha ausente significa "usa o valor do ambiente ou do código".';
COMMENT ON COLUMN "platform_settings"."updatedBy" IS 'Último autor. O histórico completo está na trilha de auditoria.';
