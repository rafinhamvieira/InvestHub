import { z } from "zod";

/**
 * Validação de entrada da auditoria.
 *
 * Centralizada aqui — nem a rota nem o serviço reinterpretam parâmetro: `pageSize` tem teto,
 * datas são ISO e o cursor é numérico. URL forjada com `pageSize=100000` vira erro de
 * validação, não varredura de tabela.
 */
export const auditFiltersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.enum(["LOGIN", "ACCOUNT", "PASSWORD", "TWO_FACTOR", "ADMIN"]).optional(),
  action: z.string().trim().max(60).optional(),
  result: z.enum(["SUCCESS", "FAILED"]).optional(),
  userId: z.string().trim().max(40).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /** `seq` do último item da página anterior. */
  cursor: z.string().regex(/^\d+$/).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const auditExportSchema = auditFiltersSchema.extend({
  format: z.enum(["csv", "xlsx"]).default("csv"),
});

export type AuditFiltersInput = z.infer<typeof auditFiltersSchema>;
export type AuditExportInput = z.infer<typeof auditExportSchema>;
