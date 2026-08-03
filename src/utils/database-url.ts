/**
 * Tradução da `DATABASE_URL` para o formato que as ferramentas do Postgres aceitam.
 *
 * A URL do projeto é escrita para o Prisma, e o Prisma inventa parâmetros próprios —
 * `schema`, `connection_limit`, `pgbouncer`, `pool_timeout`. O `libpq`, que é quem o
 * `pg_dump` usa para conectar, recusa a URI inteira ao encontrar um parâmetro que não
 * conhece: `invalid URI query parameter: "schema"`. O dump falha por causa de um detalhe do
 * ORM, sem nenhuma relação com o banco.
 *
 * A limpeza é por lista de permitidos, e não de proibidos: parâmetro novo do Prisma quebra
 * o backup outra vez se a decisão for "remover os que eu conheço".
 *
 * `schema` é descartado sem virar `--schema` no `pg_dump`: sem ele o dump cobre o banco
 * inteiro, que é um superconjunto do que a aplicação usa. Backup restrito a um schema é
 * backup que restaura menos do que existia.
 */

/** Parâmetros de conexão que o libpq reconhece (PostgreSQL 16, seção 34.1.2). */
const LIBPQ_PARAMS = new Set([
  "host",
  "hostaddr",
  "port",
  "dbname",
  "user",
  "password",
  "passfile",
  "require_auth",
  "channel_binding",
  "connect_timeout",
  "client_encoding",
  "options",
  "application_name",
  "fallback_application_name",
  "keepalives",
  "keepalives_idle",
  "keepalives_interval",
  "keepalives_count",
  "tcp_user_timeout",
  "replication",
  "gssencmode",
  "gssdelegation",
  "sslmode",
  "requiressl",
  "sslcompression",
  "sslcert",
  "sslkey",
  "sslpassword",
  "sslcertmode",
  "sslrootcert",
  "sslcrl",
  "sslcrldir",
  "sslsni",
  "requirepeer",
  "ssl_min_protocol_version",
  "ssl_max_protocol_version",
  "krbsrvname",
  "gsslib",
  "service",
  "target_session_attrs",
  "load_balance_hosts",
]);

/**
 * Devolve a mesma URL sem os parâmetros que o libpq não entende.
 *
 * Trabalha só sobre a query, por recorte de texto: usuário e senha não são reinterpretados
 * nem recodificados no caminho. Senha com caractere especial já vem percent-encoded, e
 * reserializar a URL é a forma mais fácil de corrompê-la em silêncio.
 */
export function toLibpqUrl(url: string): string {
  const separator = url.indexOf("?");
  if (separator === -1) return url;

  const base = url.slice(0, separator);
  const kept = url
    .slice(separator + 1)
    .split("&")
    .filter((pair) => pair.length > 0)
    .filter((pair) => {
      const name = pair.slice(0, pair.indexOf("=") === -1 ? undefined : pair.indexOf("="));
      return LIBPQ_PARAMS.has(decodeURIComponent(name).toLowerCase());
    });

  return kept.length === 0 ? base : `${base}?${kept.join("&")}`;
}
