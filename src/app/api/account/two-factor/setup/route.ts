import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { twoFactorService } from "@/services/two-factor.service";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const setup = await twoFactorService.generateSetup(session.user.email!);
  return NextResponse.json(setup);
}
