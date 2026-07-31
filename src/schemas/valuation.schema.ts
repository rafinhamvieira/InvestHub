import { z } from "zod";

const percentField = z.coerce.number().min(0).max(100);

export const assumptionInputSchema = z.object({
  ticker: z.string().trim().toUpperCase().min(3).max(30),
  method: z.enum(["GRAHAM", "BAZIN", "LYNCH", "DCF", "CUSTOM"]),
  /** Todos em percentual (6 = 6%); convertidos para fração no service. */
  desiredDividendYield: percentField.optional(),
  marginOfSafety: percentField.optional(),
  growthRate: percentField.optional(),
  discountRate: percentField.optional(),
  perpetuityGrowthRate: percentField.optional(),
  projectionYears: z.coerce.number().int().min(1).max(30).optional(),
  grahamMultiplier: z.coerce.number().min(1).max(100).optional(),
});

export type AssumptionInput = z.infer<typeof assumptionInputSchema>;
