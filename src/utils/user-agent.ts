/**
 * Leitura do user-agent — puro, sem I/O.
 *
 * O objetivo é o rótulo que o usuário vai reconhecer na lista de sessões: "Chrome ·
 * Windows 11". Não é identificação forense, e por isso a heurística simples basta — a
 * ordem das comparações é o que importa, já que quase todo navegador mente dizendo-se
 * "Mozilla" e vários se dizem "Chrome".
 */

export interface UserAgentInfo {
  browser: string | null;
  os: string | null;
}

/** Ordem importa: Edge e Opera se anunciam como Chrome, Chrome se anuncia como Safari. */
const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//i, "Edge"],
  [/OPR\/|Opera/i, "Opera"],
  [/Firefox\//i, "Firefox"],
  [/Chrome\//i, "Chrome"],
  [/Safari\//i, "Safari"],
  [/curl\//i, "curl"],
  [/PostmanRuntime/i, "Postman"],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/Windows NT 10\.0/i, "Windows 10/11"],
  [/Windows NT 6\.3/i, "Windows 8.1"],
  [/Windows/i, "Windows"],
  [/iPhone|iPad|iPod/i, "iOS"],
  [/Android/i, "Android"],
  [/Mac OS X|Macintosh/i, "macOS"],
  [/Linux/i, "Linux"],
];

function match(value: string, table: Array<[RegExp, string]>): string | null {
  for (const [pattern, label] of table) {
    if (pattern.test(value)) return label;
  }
  return null;
}

export function parseUserAgent(userAgent: string | null | undefined): UserAgentInfo {
  if (!userAgent) return { browser: null, os: null };
  return { browser: match(userAgent, BROWSERS), os: match(userAgent, SYSTEMS) };
}

/** "Chrome · Windows 10/11 · Porto Alegre" — o que a lista de sessões exibe. */
export function describeSession(info: {
  browser: string | null;
  os: string | null;
  location: string | null;
}): string {
  const parts = [info.browser, info.os, info.location].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Origem desconhecida";
}
