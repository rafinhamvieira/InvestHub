import { z } from "zod";

export const TICKER_REGEX = /^[A-Z0-9-]{3,30}$/;

export const transactionInputSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(TICKER_REGEX, "Ticker inválido. Use letras, números e hífen (ex: PETR4, HGLG11)."),
  assetType: z.enum(["STOCK", "FII", "ETF", "BDR", "TREASURY"]),
  type: z.enum(["BUY", "SELL"]),
  quantity: z.coerce.number().positive("Quantidade deve ser maior que zero."),
  price: z.coerce.number().nonnegative("Preço não pode ser negativo."),
  fees: z.coerce.number().nonnegative("Taxas não podem ser negativas.").default(0),
  date: z.coerce
    .date()
    .max(new Date(Date.now() + 24 * 60 * 60 * 1000), "Data não pode estar no futuro."),
  brokerName: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;
