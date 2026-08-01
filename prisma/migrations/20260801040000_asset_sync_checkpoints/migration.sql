-- Marcadores de tentativa das filas de rotação (fundamentos e proventos).
-- Sem eles, ativo que a fonte não cobre volta ao início da fila indefinidamente.
ALTER TABLE "assets" ADD COLUMN "fundamentalsCheckedAt" TIMESTAMP(3);
ALTER TABLE "assets" ADD COLUMN "dividendsCheckedAt" TIMESTAMP(3);

-- Quem já tem indicador ou provento na base conta como verificado, para a fila começar
-- pelos que faltam em vez de refazer o que o backfill já trouxe.
UPDATE "assets" a
SET "fundamentalsCheckedAt" = NOW()
WHERE EXISTS (
  SELECT 1 FROM "asset_fundamentals" f
  WHERE f."assetId" = a.id
    AND (f.pl IS NOT NULL OR f.pvp IS NOT NULL OR f."dividendYield" IS NOT NULL OR f.roe IS NOT NULL)
);

UPDATE "assets" a
SET "dividendsCheckedAt" = NOW()
WHERE EXISTS (SELECT 1 FROM "asset_dividends" d WHERE d."assetId" = a.id);
