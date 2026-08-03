import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * Porteiro da suíte de integração.
 *
 * Existe por causa de um episódio concreto: a verificação de integridade da trilha de
 * auditoria quebrava desde sempre — `jsonb::text` não é `JSON.stringify` — e havia um teste
 * aqui que pegava isso. Ele nunca rodou. A suíte se declarava ignorada quando
 * `TEST_DATABASE_URL` faltava, e "0 testes, tudo verde" é indistinguível de sucesso para
 * quem lê a saída de passagem.
 *
 * Ausência de banco passou a ser **falha ruidosa**, com o comando pronto na mensagem. Um
 * teste que não roda não é um teste; ele só custa a ilusão de estar coberto.
 *
 * O `migrate deploy` roda aqui de propósito: banco de teste com schema velho produz falha
 * confusa ou, pior, passa por engano.
 */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error(
      [
        "TEST_DATABASE_URL não definida — a suíte de integração precisa de um Postgres real.",
        "",
        "  1. crie o banco uma vez:",
        "     docker compose -f docker-compose.dev.yml up -d postgres",
        '     docker compose -f docker-compose.dev.yml exec -T postgres psql -U investhub -c "CREATE DATABASE investhub_test"',
        "",
        "  2. rode a suíte:",
        "     TEST_DATABASE_URL=postgresql://investhub:investhub@localhost:5432/investhub_test npm run test:integration",
        "",
        "No Windows, use  $env:TEST_DATABASE_URL=\"...\"  antes do npm.",
      ].join("\n"),
    );
  }

  /**
   * A suíte começa apagando **todas** as tabelas antes de cada teste, e o config aponta o
   * `DATABASE_URL` do processo para cá. O custo de um engano é a carteira de quem usa a
   * plataforma — perda que backup nenhum desfaz na hora.
   *
   * A guarda é sobre o nome do banco, e não sobre comparar com o `DATABASE_URL` do
   * ambiente: essa comparação seria inútil, porque é justamente esta suíte que o substitui.
   * Nome é o que sobra de independente — e um banco em uso de verdade não se chama "test".
   */
  const database = url.split("/").pop()?.split("?")[0] ?? "";
  if (!database.toLowerCase().includes("test")) {
    throw new Error(
      `O banco "${database}" não parece de teste. Exija "test" no nome — é o que impede que ` +
        "um TRUNCATE distraído caia sobre dados de verdade.",
    );
  }

  const prismaBin = join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma",
  );

  try {
    execFileSync(prismaBin, ["migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "inherit",
    });
  } catch {
    throw new Error(
      `Não foi possível migrar ${database}. Se o banco ainda não existe, crie-o:\n` +
        `  docker compose -f docker-compose.dev.yml exec -T postgres psql -U investhub -c "CREATE DATABASE ${database}"`,
    );
  }
}
