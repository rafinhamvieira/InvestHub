import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma, resetDatabase, createUser, TEST_DATABASE_URL } from "./helpers";

// O client do serviço precisa apontar para o banco de teste antes de qualquer import dele.
process.env.DATABASE_URL = TEST_DATABASE_URL ?? process.env.DATABASE_URL;

/**
 * Curva do Banco Central fixa: 0,04% ao dia útil.
 *
 * Sem isso o teste dependeria da rede e do CDI do dia — e falharia por motivo que não tem
 * nada a ver com o código sob teste.
 */
vi.mock("@/services/market-data/bcb.provider", () => ({
  BcbProvider: class {
    readonly name = "BCB (teste)";
    async getDailyRates(_indexer: string, since: Date) {
      const rates = [];
      const end = Date.now();
      for (let time = since.getTime(); time <= end; time += 24 * 60 * 60 * 1000) {
        const date = new Date(time);
        const day = date.getUTCDay();
        if (day !== 0 && day !== 6) rates.push({ date, rate: 0.04 });
      }
      return rates;
    }
    async getIpcaRates() {
      return [];
    }
  },
}));

const { portfolioService, PortfolioError } = await import("@/services/portfolio.service");

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

describe("lançamento de transações (banco real)", () => {
  beforeEach(resetDatabase);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("registra compra de ação, consolida posição e monta o grupo da carteira", async () => {
    const user = await createUser();

    await portfolioService.createTransaction(user.id, {
      ticker: "PETR4",
      assetType: "STOCK",
      type: "BUY",
      quantity: 100,
      price: 38.5,
      fees: 0,
      date: daysAgo(30),
      brokerName: "XP",
      notes: "",
    });

    const position = await prisma.position.findFirst({ where: { userId: user.id } });
    expect(position).not.toBeNull();
    expect(Number(position!.quantity)).toBe(100);
    expect(Number(position!.totalInvested)).toBe(3850);

    const portfolio = await portfolioService.getPortfolio(user.id);
    expect(portfolio.positions).toHaveLength(1);
    expect(portfolio.groups).toHaveLength(1);
    expect(portfolio.groups[0]!.assetType).toBe("STOCK");
    expect(portfolio.groups[0]!.totalInvested).toBe(3850);
    expect(portfolio.brokers).toContain("XP");
  });

  it("recalcula o preço médio depois da segunda compra", async () => {
    const user = await createUser();
    const base = {
      ticker: "ITSA4",
      assetType: "STOCK" as const,
      type: "BUY" as const,
      fees: 0,
      brokerName: "",
      notes: "",
    };

    await portfolioService.createTransaction(user.id, {
      ...base,
      quantity: 100,
      price: 10,
      date: daysAgo(60),
    });
    await portfolioService.createTransaction(user.id, {
      ...base,
      quantity: 100,
      price: 12,
      date: daysAgo(30),
    });

    const portfolio = await portfolioService.getPortfolio(user.id);
    const position = portfolio.positions[0]!;
    expect(position.quantity).toBe(200);
    expect(position.averagePrice).toBe(11);
  });

  it("recusa venda maior que a custódia na data", async () => {
    const user = await createUser();

    await portfolioService.createTransaction(user.id, {
      ticker: "BBAS3",
      assetType: "STOCK",
      type: "BUY",
      quantity: 50,
      price: 27,
      fees: 0,
      date: daysAgo(10),
      brokerName: "",
      notes: "",
    });

    await expect(
      portfolioService.createTransaction(user.id, {
        ticker: "BBAS3",
        assetType: "STOCK",
        type: "SELL",
        quantity: 80,
        price: 29,
        fees: 0,
        date: daysAgo(5),
        brokerName: "",
        notes: "",
      }),
    ).rejects.toBeInstanceOf(PortfolioError);
  });
});

describe("renda fixa (banco real)", () => {
  beforeEach(resetDatabase);

  const cdb = {
    assetType: "FIXED_INCOME" as const,
    type: "BUY" as const,
    fees: 0,
    brokerName: "",
    notes: "",
    fixedIncome: {
      name: "CDB Banco Teste 2028",
      issuer: "Banco Teste",
      indexer: "CDI" as const,
      indexPercent: 110,
      spreadPercent: null,
      amount: 5000,
      maturityDate: null,
    },
  };

  it("converte valor aplicado em quantidade pela curva e guarda as condições", async () => {
    const user = await createUser();

    await portfolioService.createTransaction(user.id, { ...cdb, date: daysAgo(0) });

    const asset = await prisma.asset.findFirst({ where: { type: "FIXED_INCOME" } });
    expect(asset).not.toBeNull();

    const terms = await prisma.fixedIncomeTerms.findUnique({ where: { assetId: asset!.id } });
    expect(terms?.indexer).toBe("CDI");
    expect(Number(terms?.indexPercent)).toBe(110);

    // Comprado na data de início da curva: valor unitário 1,00, quantidade = valor aplicado.
    const position = await prisma.position.findFirst({ where: { userId: user.id } });
    expect(Number(position!.quantity)).toBeCloseTo(5000, 6);
    expect(Number(position!.totalInvested)).toBe(5000);
  });

  it("corrige o título pelo indexador e mostra rendimento na carteira", async () => {
    const user = await createUser();

    // Compra retroativa: 60 dias corridos de CDI a 0,04% ao dia útil.
    await portfolioService.createTransaction(user.id, { ...cdb, date: daysAgo(60) });

    const portfolio = await portfolioService.getPortfolio(user.id);
    const position = portfolio.positions[0]!;

    expect(position.totalInvested).toBe(5000);
    expect(position.currentValue).toBeGreaterThan(5000);
    expect(position.profitPercent).toBeGreaterThan(0);
    expect(position.fixedIncome?.remuneration).toBe("110% do CDI");

    const grupo = portfolio.groups.find((g) => g.assetType === "FIXED_INCOME");
    expect(grupo?.label).toBe("Renda Fixa");
    expect(grupo?.positions).toHaveLength(1);
  });

  it("separa Tesouro de renda fixa privada em grupos diferentes", async () => {
    const user = await createUser();

    await portfolioService.createTransaction(user.id, { ...cdb, date: daysAgo(30) });
    await portfolioService.createTransaction(user.id, {
      ...cdb,
      assetType: "TREASURY",
      date: daysAgo(30),
      fixedIncome: {
        ...cdb.fixedIncome,
        name: "Tesouro Selic 2029",
        issuer: "Tesouro Nacional",
        indexer: "SELIC",
        indexPercent: 100,
        amount: 3000,
      },
    });

    const portfolio = await portfolioService.getPortfolio(user.id);
    const tipos = portfolio.groups.map((group) => group.assetType).sort();
    expect(tipos).toEqual(["FIXED_INCOME", "TREASURY"]);
  });

  it("resgate zera a posição e registra a venda pelo valor corrigido", async () => {
    const user = await createUser();

    await portfolioService.createTransaction(user.id, { ...cdb, date: daysAgo(45) });
    const asset = await prisma.asset.findFirst({ where: { type: "FIXED_INCOME" } });

    await portfolioService.redeemFixedIncome(user.id, asset!.id);

    const position = await prisma.position.findFirst({ where: { userId: user.id } });
    expect(position).toBeNull();

    const venda = await prisma.transaction.findFirst({ where: { userId: user.id, type: "SELL" } });
    expect(venda).not.toBeNull();
    expect(Number(venda!.price)).toBeGreaterThan(1);

    const portfolio = await portfolioService.getPortfolio(user.id);
    expect(portfolio.positions).toHaveLength(0);
  });
});
