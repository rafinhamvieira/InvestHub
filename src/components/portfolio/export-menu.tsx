"use client";

import { Download, FileSpreadsheet, FileText, FileType } from "lucide-react";
import { format } from "date-fns";
import { buildCsv } from "@/utils/csv";
import { formatCurrency, formatPercent } from "@/utils/format";
import { formatDateOnly } from "@/utils/date";
import type { PortfolioData } from "@/types/portfolio";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportMenu({ data }: { data: PortfolioData }) {
  const today = new Date().toISOString().slice(0, 10);

  function exportCsv() {
    const csv = buildCsv(
      data.positions.map((p) => ({ ...p })),
      [
        { key: "ticker", label: "Ticker" },
        { key: "name", label: "Nome" },
        { key: "assetType", label: "Tipo" },
        { key: "sector", label: "Setor" },
        { key: "quantity", label: "Quantidade" },
        { key: "averagePrice", label: "Preço médio" },
        { key: "currentPrice", label: "Preço atual" },
        { key: "totalInvested", label: "Investido" },
        { key: "currentValue", label: "Valor atual" },
        { key: "profit", label: "Resultado" },
      ],
    );
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `investhub-carteira-${today}.csv`);
  }

  async function exportPdf() {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF();
    const generatedAt = format(new Date(), "dd/MM/yyyy HH:mm");

    doc.setFontSize(18);
    doc.text("InvestHub — Relatório da Carteira", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Gerado em ${generatedAt}`, 14, 25);

    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(
      [
        `Patrimônio: ${formatCurrency(data.totals.totalValue)}`,
        `Investido: ${formatCurrency(data.totals.totalInvested)}`,
        `Resultado: ${formatCurrency(data.totals.profit)} (${formatPercent(data.totals.profitPercent)})`,
      ].join("   ·   "),
      14,
      34,
    );

    autoTable(doc, {
      startY: 40,
      head: [["Ticker", "Qtd.", "PM", "Preço", "Investido", "Valor", "Resultado", "%"]],
      body: data.positions.map((p) => [
        p.ticker,
        String(p.quantity),
        formatCurrency(p.averagePrice),
        formatCurrency(p.currentPrice),
        formatCurrency(p.totalInvested),
        formatCurrency(p.currentValue),
        formatCurrency(p.profit),
        formatPercent(p.weight),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 122, 87] },
    });

    const afterPositions = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
    doc.setFontSize(12);
    doc.text("Transações", 14, afterPositions + 10);

    autoTable(doc, {
      startY: afterPositions + 14,
      head: [["Data", "Ticker", "Operação", "Qtd.", "Preço", "Taxas", "Total"]],
      body: data.transactions.map((t) => [
        formatDateOnly(t.date),
        t.ticker,
        t.type === "BUY" ? "Compra" : "Venda",
        String(t.quantity),
        formatCurrency(t.price),
        formatCurrency(t.fees),
        formatCurrency(t.total),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 122, 87] },
    });

    doc.save(`investhub-carteira-${today}.pdf`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportCsv}>
          <FileText className="mr-2 size-4" />
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/api/portfolio/export/excel" download>
            <FileSpreadsheet className="mr-2 size-4" />
            Excel
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPdf}>
          <FileType className="mr-2 size-4" />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
