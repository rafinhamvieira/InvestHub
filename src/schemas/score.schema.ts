import { z } from "zod";

const weightField = z.coerce.number().int().min(0).max(100);

export const scoreWeightsSchema = z
  .object({
    valuation: weightField,
    dividendYield: weightField,
    pl: weightField,
    roe: weightField,
    margins: weightField,
    debt: weightField,
    priceSafetyMargin: weightField,
    dividendHistory: weightField,
    liquidity: weightField,
    governance: weightField,
  })
  .refine((weights) => Object.values(weights).reduce((sum, w) => sum + w, 0) > 0, {
    message: "Ao menos um critério precisa ter peso maior que zero.",
  });

export type ScoreWeightsInput = z.infer<typeof scoreWeightsSchema>;
