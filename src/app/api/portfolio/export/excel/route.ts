import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { portfolioService } from "@/services/portfolio.service";
import { logger } from "@/lib/logger";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const data = await portfolioService.getPortfolio(session.user.id);
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "InvestHub";

    const positions = workbook.addWorksheet("Posições");
    positions.columns = [
      { header: "Ticker", key: "ticker", width: 12 },
      { header: "Nome", key: "name", width: 32 },
      { header: "Tipo", key: "type", width: 10 },
      { header: "Setor", key: "sector", width: 24 },
      { header: "Quantidade", key: "quantity", width: 12 },
      { header: "Preço médio", key: "averagePrice", width: 14 },
      { header: "Preço atual", key: "currentPrice", width: 14 },
      { header: "Investido", key: "totalInvested", width: 14 },
      { header: "Valor atual", key: "currentValue", width: 14 },
      { header: "Resultado", key: "profit", width: 14 },
      { header: "Resultado %", key: "profitPercent", width: 12 },
      { header: "% carteira", key: "weight", width: 12 },
    ];
    positions.getRow(1).font = { bold: true };
    for (const p of data.positions) {
      positions.addRow({
        ticker: p.ticker,
        name: p.name,
        type: p.assetType,
        sector: p.sector ?? "",
        quantity: p.quantity,
        averagePrice: p.averagePrice,
        currentPrice: p.currentPrice,
        totalInvested: p.totalInvested,
        currentValue: p.currentValue,
        profit: p.profit,
        profitPercent: p.profitPercent,
        weight: p.weight,
      });
    }
    ["F", "G", "H", "I", "J"].forEach((col) => {
      positions.getColumn(col).numFmt = 'R$ #,##0.00';
    });
    ["K", "L"].forEach((col) => {
      positions.getColumn(col).numFmt = "0.00%";
    });

    const transactions = workbook.addWorksheet("Transações");
    transactions.columns = [
      { header: "Data", key: "date", width: 12 },
      { header: "Ticker", key: "ticker", width: 12 },
      { header: "Operação", key: "type", width: 10 },
      { header: "Quantidade", key: "quantity", width: 12 },
      { header: "Preço", key: "price", width: 14 },
      { header: "Taxas", key: "fees", width: 12 },
      { header: "Total", key: "total", width: 14 },
      { header: "Corretora", key: "broker", width: 16 },
      { header: "Observações", key: "notes", width: 32 },
    ];
    transactions.getRow(1).font = { bold: true };
    for (const t of data.transactions) {
      transactions.addRow({
        date: new Date(t.date),
        ticker: t.ticker,
        type: t.type === "BUY" ? "Compra" : "Venda",
        quantity: t.quantity,
        price: t.price,
        fees: t.fees,
        total: t.total,
        broker: t.brokerName ?? "",
        notes: t.notes ?? "",
      });
    }
    transactions.getColumn("A").numFmt = "dd/mm/yyyy";
    ["E", "F", "G"].forEach((col) => {
      transactions.getColumn(col).numFmt = 'R$ #,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `investhub-carteira-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error("Falha na exportação Excel", { error: (error as Error).message });
    return NextResponse.json({ error: "EXPORT_FAILED" }, { status: 500 });
  }
}
