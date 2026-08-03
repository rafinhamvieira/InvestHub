import { describe, expect, it } from "vitest";
import { toLibpqUrl } from "@/utils/database-url";

const BASE = "postgresql://investhub:senha@postgres:5432/investhub";

describe("toLibpqUrl", () => {
  it("remove o parâmetro do Prisma que derrubava o pg_dump", () => {
    // O erro real de produção: pg_dump: error: invalid URI query parameter: "schema"
    expect(toLibpqUrl(`${BASE}?schema=public`)).toBe(BASE);
  });

  it("preserva a URL quando não há query", () => {
    expect(toLibpqUrl(BASE)).toBe(BASE);
  });

  it("mantém o que o libpq entende e descarta o resto", () => {
    const url = `${BASE}?sslmode=require&schema=public&connection_limit=5&connect_timeout=10`;

    expect(toLibpqUrl(url)).toBe(`${BASE}?sslmode=require&connect_timeout=10`);
  });

  it("descarta os demais parâmetros só do Prisma", () => {
    const url = `${BASE}?pgbouncer=true&pool_timeout=0&socket_timeout=5&statement_cache_size=0`;

    expect(toLibpqUrl(url)).toBe(BASE);
  });

  it("não reinterpreta credenciais — senha percent-encoded sai intacta", () => {
    // Reserializar a URL é a forma mais fácil de corromper uma senha com caractere especial.
    const comSenhaDifícil = "postgresql://user:p%40ss%3Aword%2F1@host:5432/db";

    expect(toLibpqUrl(`${comSenhaDifícil}?schema=public`)).toBe(comSenhaDifícil);
  });

  it("aceita nome de parâmetro em maiúsculas", () => {
    expect(toLibpqUrl(`${BASE}?SSLMode=require`)).toBe(`${BASE}?SSLMode=require`);
  });

  it("ignora par vazio deixado por query malformada", () => {
    expect(toLibpqUrl(`${BASE}?&schema=public&`)).toBe(BASE);
  });

  it("mantém parâmetro sem valor que o libpq conhece", () => {
    expect(toLibpqUrl(`${BASE}?sslmode`)).toBe(`${BASE}?sslmode`);
  });
});
