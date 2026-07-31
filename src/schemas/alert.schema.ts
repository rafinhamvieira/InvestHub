import { z } from "zod";
import { TICKER_REGEX } from "@/schemas/transaction.schema";

export const alertInputSchema = z
  .object({
    ticker: z.string().trim().toUpperCase().regex(TICKER_REGEX, "Ticker inválido."),
    type: z.enum([
      "PRICE_ABOVE",
      "PRICE_BELOW",
      "DIVIDEND_YIELD_ABOVE",
      "PL_BELOW",
      "FAIR_PRICE_MARGIN_REACHED",
      "NEW_DIVIDEND_DECLARED",
    ]),
    targetValue: z.coerce.number().nonnegative().default(0),
    channel: z.enum(["EMAIL", "IN_APP"]).default("IN_APP"),
  })
  .superRefine((data, ctx) => {
    if (data.type !== "NEW_DIVIDEND_DECLARED" && data.targetValue <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetValue"],
        message: "Informe um valor alvo maior que zero.",
      });
    }
  });

export type AlertInput = z.infer<typeof alertInputSchema>;
