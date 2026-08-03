import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Testes de integração: rodam contra um Postgres real, não contra mocks.
 *
 * Ficam separados dos unitários de propósito — precisam de banco, são mais lentos e não
 * devem travar o `npm test` de quem só quer validar uma função pura.
 *
 * Sem `TEST_DATABASE_URL`, a suíte **falha** com o comando pronto na mensagem. Ela já se
 * declarou ignorada nessa situação, e foi assim que um defeito real na trilha de auditoria
 * atravessou meses coberto por um teste que nunca executou. Ver `global-setup.ts`.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    /**
     * O `DATABASE_URL` do processo de teste passa a ser o banco de teste.
     *
     * Sem isto, os testes escreveriam pelo cliente de `helpers` e leriam pelo singleton de
     * `@/lib/prisma` — dois bancos diferentes, e um caso que exercite repositório de verdade
     * (a verificação da trilha, por exemplo) leria uma tabela vazia e passaria por engano.
     *
     * A guarda que impede apontar para dado real está no `global-setup`, e é sobre o nome do
     * banco: ela roda antes desta substituição e não depende dela.
     */
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      /**
       * Nenhum e-mail sai daqui.
       *
       * Os serviços administrativos avisam o usuário afetado a cada ação, e a suíte roda
       * dentro do compose, com as credenciais reais no `env_file`. Sem esta linha, testar
       * "encerrar sessões" manda e-mail de verdade, pela conta de produção, para endereços
       * inventados — que voltam como falha de entrega e sujam a reputação do remetente.
       */
      EMAIL_PROVIDER: "disabled",
    },
    // Um banco só, compartilhado: arquivos em paralelo embaralhariam os dados.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
