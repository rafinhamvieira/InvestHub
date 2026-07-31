import { PrismaClient, AssetType } from "@prisma/client";

const prisma = new PrismaClient();

const seedAssets: Array<{ ticker: string; name: string; type: AssetType; sector?: string }> = [
  { ticker: "PETR4", name: "Petróleo Brasileiro S.A.", type: "STOCK", sector: "Petróleo, Gás e Biocombustíveis" },
  { ticker: "VALE3", name: "Vale S.A.", type: "STOCK", sector: "Materiais Básicos" },
  { ticker: "ITUB4", name: "Itaú Unibanco Holding S.A.", type: "STOCK", sector: "Financeiro" },
  { ticker: "BBAS3", name: "Banco do Brasil S.A.", type: "STOCK", sector: "Financeiro" },
  { ticker: "WEGE3", name: "WEG S.A.", type: "STOCK", sector: "Bens Industriais" },
  { ticker: "CMIG4", name: "Companhia Energética de Minas Gerais", type: "STOCK", sector: "Utilidade Pública" },
  { ticker: "HGLG11", name: "CSHG Logística FII", type: "FII", sector: "Logística" },
  { ticker: "MXRF11", name: "Maxi Renda FII", type: "FII", sector: "Papel" },
  { ticker: "KNRI11", name: "Kinea Renda Imobiliária FII", type: "FII", sector: "Híbrido" },
];

async function main() {
  for (const asset of seedAssets) {
    await prisma.asset.upsert({
      where: { ticker: asset.ticker },
      update: {},
      create: asset,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seed concluído: ${seedAssets.length} ativos.`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
