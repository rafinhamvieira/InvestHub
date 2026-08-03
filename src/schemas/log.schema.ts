import { z } from "zod";

/**
 * Filtros do log vindos da URL.
 *
 * Os níveis chegam como lista separada por vírgula (`levels=warn,error`) porque é o que
 * sobrevive a um `URLSearchParams` sem virar repetição de chave.
 */
export const logFiltersSchema = z.object({
  levels: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((level) => level.trim())
            .filter((level) => ["debug", "info", "warn", "error"].includes(level))
        : undefined,
    ),
  search: z.string().trim().max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});
