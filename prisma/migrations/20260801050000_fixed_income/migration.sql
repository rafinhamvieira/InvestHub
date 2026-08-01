-- Renda fixa: classe própria para papel privado e condições do título.
ALTER TYPE "AssetType" ADD VALUE 'FIXED_INCOME';

CREATE TYPE "FixedIncomeIndexer" AS ENUM ('SELIC', 'CDI', 'IPCA', 'PREFIXADO');

CREATE TABLE "fixed_income_terms" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "issuer" TEXT,
    "indexer" "FixedIncomeIndexer" NOT NULL,
    "indexPercent" DECIMAL(8,4),
    "spreadPercent" DECIMAL(8,4),
    "startDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_income_terms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fixed_income_terms_assetId_key" ON "fixed_income_terms"("assetId");

ALTER TABLE "fixed_income_terms"
  ADD CONSTRAINT "fixed_income_terms_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
