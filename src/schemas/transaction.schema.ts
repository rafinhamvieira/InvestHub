import { z } from "zod";
import { toUtcDateOnly } from "@/utils/date";

export const TICKER_REGEX = /^[A-Z0-9-]{3,30}$/;

export const FIXED_INCOME_TYPES = ["TREASURY", "FIXED_INCOME"] as const;

/** Classes que não têm cotação: o valor sai da correção do indexador. */
export function isFixedIncomeType(type: string): boolean {
  return (FIXED_INCOME_TYPES as readonly string[]).includes(type);
}

/**
 * Condições do título. Em renda fixa o usuário informa quanto aplicou e como o papel
 * remunera — quantidade e preço unitário são derivados da curva, não digitados.
 */
export const fixedIncomeInputSchema = z.object({
  name: z.string().trim().min(3, "Descreva o título.").max(80),
  issuer: z.string().trim().max(60).optional().or(z.literal("")),
  indexer: z.enum(["SELIC", "CDI", "IPCA", "PREFIXADO"]),
  /** Percentual do índice (110 = 110% do CDI). */
  indexPercent: z.coerce.number().positive().max(1000).optional().nullable(),
  /** Juro anual somado ao índice, ou taxa cheia do prefixado. */
  spreadPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  amount: z.coerce.number().positive("Informe o valor aplicado."),
  maturityDate: z
    .preprocess(
      (value) => (typeof value === "string" && value !== "" ? toUtcDateOnly(value) : (value ?? null)),
      z.date().nullable(),
    )
    .optional(),
});

export const transactionInputSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(TICKER_REGEX, "Ticker inválido. Use letras, números e hífen (ex: PETR4, HGLG11).")
    // Renda fixa não tem ticker: o identificador é gerado a partir das condições do papel.
    .optional()
    .or(z.literal("")),
  assetType: z.enum(["STOCK", "FII", "ETF", "BDR", "TREASURY", "FIXED_INCOME"]),
  type: z.enum(["BUY", "SELL"]),
  quantity: z.coerce.number().positive("Quantidade deve ser maior que zero.").optional(),
  price: z.coerce.number().nonnegative("Preço não pode ser negativo.").optional(),
  fixedIncome: fixedIncomeInputSchema.optional(),
  fees: z.coerce.number().nonnegative("Taxas não podem ser negativas.").default(0),
  // Normalizamos para meia-noite UTC: a data da operação é um dia do calendário, e sem
  // isso ela seria exibida um dia antes em fusos negativos (o caso do Brasil).
  date: z.preprocess(
    (value) =>
      typeof value === "string" || value instanceof Date ? toUtcDateOnly(value) : value,
    z.date({ message: "Data inválida." }).max(
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      "Data não pode estar no futuro.",
    ),
  ),
  brokerName: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
})
  .superRefine((data, ctx) => {
    if (isFixedIncomeType(data.assetType)) {
      if (!data.fixedIncome) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fixedIncome"],
          message: "Informe as condições do título.",
        });
        return;
      }

      const { indexer, indexPercent, spreadPercent } = data.fixedIncome;
      // Cada formato de contrato exige um campo diferente; sem isso o título renderia zero
      // e o usuário só descobriria depois, olhando a carteira parada.
      if (indexer === "PREFIXADO" && !spreadPercent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fixedIncome", "spreadPercent"],
          message: "Informe a taxa anual do prefixado.",
        });
      }
      if (indexer === "IPCA" && spreadPercent === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fixedIncome", "spreadPercent"],
          message: "Informe o juro real (IPCA + quanto).",
        });
      }
      if ((indexer === "CDI" || indexer === "SELIC") && !indexPercent && !spreadPercent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fixedIncome", "indexPercent"],
          message: "Informe o percentual do índice (ex: 110) ou o spread.",
        });
      }
      return;
    }

    if (!data.ticker) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ticker"], message: "Informe o ticker." });
    }
    if (data.quantity === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "Informe a quantidade.",
      });
    }
    if (data.price === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Informe o preço." });
    }
  });

export type TransactionInput = z.infer<typeof transactionInputSchema>;
