import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Testes de integração: rodam contra um Postgres real, não contra mocks.
 *
 * Ficam separados dos unitários de propósito — precisam de banco, são mais lentos e não
 * devem travar o `npm test` de quem só quer validar uma função pura. Sem
 * `TEST_DATABASE_URL` definido, a suíte inteira se declara ignorada em vez de falhar.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
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
