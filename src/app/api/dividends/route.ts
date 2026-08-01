import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dividendService, type DividendPeriod } from "@/services/dividend.service";
import { logger } from "@/lib/logger";

const PERIODS: DividendPeriod[] = ["12m", "24m", "60m", "all"];

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const requested = new URL(request.url).searchParams.get("period");
  const period = PERIODS.includes(requested as DividendPeriod)
    ? (requested as DividendPeriod)
    : "12m";

  try {
    const overview = await dividendService.getOverview(session.user.id, period);
    return NextResponse.json(overview);
  } catch (error) {
    logger.error("Falha ao carregar proventos", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
