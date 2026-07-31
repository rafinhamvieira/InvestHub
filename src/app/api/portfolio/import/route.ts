import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseCsv, mapRowsToTransactions } from "@/utils/import-parser";
import { portfolioImportService } from "@/services/portfolio-import.service";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

async function extractRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v === null || v === undefined) values.push("");
        else if (v instanceof Date) values.push(v.toISOString().slice(0, 10));
        else if (typeof v === "object" && "result" in v) values.push(String(v.result ?? ""));
        else if (typeof v === "object" && "text" in v) values.push(String(v.text ?? ""));
        else values.push(String(v));
      });
      rows.push(values);
    });
    return rows;
  }

  return parseCsv(await file.text());
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const dryRun = formData?.get("dryRun") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "FILE_REQUIRED", message: "Envie um arquivo." }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "FILE_TOO_LARGE", message: "Arquivo acima de 5 MB." },
      { status: 400 },
    );
  }

  try {
    const rows = await extractRows(file);
    const { parsed, errors } = mapRowsToTransactions(rows);
    const report = await portfolioImportService.importRows(session.user.id, parsed, errors, dryRun);
    return NextResponse.json(report);
  } catch (error) {
    logger.error("Falha na importação de carteira", { error: (error as Error).message });
    return NextResponse.json(
      { error: "IMPORT_FAILED", message: "Não foi possível processar o arquivo." },
      { status: 500 },
    );
  }
}
