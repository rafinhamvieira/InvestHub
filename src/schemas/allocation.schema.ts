import { z } from "zod";
import { TICKER_REGEX } from "@/schemas/transaction.schema";

export const ASSET_CLASS_VALUES = ["STOCK", "FII", "ETF", "BDR", "TREASURY"] as const;

export const allocationTargetSchema = z
  .object({
    level: z.enum(["CLASS", "SECTOR", "ASSET"]),
    /** CLASS: um dos AssetType; SECTOR: nome do setor; ASSET: ticker. */
    label: z.string().trim().min(1, "Informe o rótulo.").max(60),
    targetPercent: z.coerce
      .number()
      .positive("Meta deve ser maior que zero.")
      .max(100, "Meta não pode exceder 100%."),
    /** Tipo do ativo quando a meta é de um ticker ainda não cadastrado. */
    assetType: z.enum(ASSET_CLASS_VALUES).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.level === "CLASS" && !ASSET_CLASS_VALUES.includes(data.label as never)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["label"],
        message: "Classe inválida.",
      });
    }
    if (data.level === "ASSET" && !TICKER_REGEX.test(data.label.toUpperCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["label"],
        message: "Ticker inválido.",
      });
    }
  })
  .transform((data) => ({
    ...data,
    label: data.level === "ASSET" ? data.label.toUpperCase() : data.label,
  }));

export type AllocationTargetInput = z.infer<typeof allocationTargetSchema>;

export const contributionRequestSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Informe um valor maior que zero.")
    .max(100_000_000, "Valor muito alto."),
  strategy: z
    .object({
      rebalance: z.boolean().default(true),
      belowFair: z.boolean().default(false),
      belowCeiling: z.boolean().default(false),
      safetyMargin: z.boolean().default(false),
      dividendYield: z.boolean().default(false),
    })
    .default({
      rebalance: true,
      belowFair: false,
      belowCeiling: false,
      safetyMargin: false,
      dividendYield: false,
    }),
});

export type ContributionRequest = z.infer<typeof contributionRequestSchema>;
