import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { watchlistRepository } from "@/repositories/watchlist.repository";
import { logger } from "@/lib/logger";

const toggleSchema = z.object({ assetId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const result = await watchlistRepository.toggle(session.user.id, parsed.data.assetId);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Falha ao alternar favorito", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
