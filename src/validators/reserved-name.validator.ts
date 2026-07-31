/**
 * Impede que usuários se apresentem como pessoal da plataforma ("Admin", "Suporte
 * InvestHub"), o que facilitaria golpes de engenharia social contra outros usuários.
 *
 * A comparação é feita sobre o nome normalizado: minúsculas, sem acentos e com
 * substituições comuns de leetspeak desfeitas ("adm1n" → "admin").
 */

const RESERVED_TERMS = new Set([
  // Administração
  "admin",
  "admins",
  "administrator",
  "administrators",
  "administrador",
  "administradora",
  "administradores",
  "administracao",
  "adm",
  "root",
  "superuser",
  "superusuario",
  "sudo",
  "owner",
  "master",
  // Sistema e operação
  "sistema",
  "system",
  "webmaster",
  "postmaster",
  "hostmaster",
  "operador",
  "operator",
  "bot",
  "daemon",
  "noreply",
  "naoresponda",
  // Atendimento e moderação
  "suporte",
  "support",
  "helpdesk",
  "atendimento",
  "moderador",
  "moderator",
  "moderacao",
  "staff",
  "equipe",
  "oficial",
  "official",
  "contato",
  "contact",
  "financeiro",
  "seguranca",
  "security",
  "compliance",
  "ouvidoria",
  // Marca
  "investhub",
]);

/** Remove acentos, desfaz leetspeak e reduz a caracteres alfanuméricos. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

/**
 * Retorna true quando o nome remete à administração da plataforma.
 *
 * Compara palavra a palavra (para não barrar nomes legítimos que apenas contenham
 * a sequência, como "Rooney") e também a forma compactada, que pega tentativas de
 * burlar com separadores: "a-d-m-i-n", "ADM_IN".
 */
export function isReservedName(name: string): boolean {
  const normalized = normalize(name);

  const words = normalized.split(/[^a-z]+/).filter(Boolean);
  if (words.some((word) => RESERVED_TERMS.has(word))) return true;

  const compact = normalized.replace(/[^a-z]/g, "");
  if (RESERVED_TERMS.has(compact)) return true;

  return false;
}

export const RESERVED_NAME_MESSAGE =
  "Este nome não pode ser usado por remeter à administração da plataforma. Informe seu nome real.";
