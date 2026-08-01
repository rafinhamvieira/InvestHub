import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { dividendService } from "@/services/dividend.service";
import { DividendsView } from "@/components/dividends/dividends-view";

export const metadata: Metadata = { title: "Proventos" };

export default async function DividendsPage() {
  const session = await auth();
  const overview = await dividendService.getOverview(session!.user.id, "12m");

  return <DividendsView initial={overview} />;
}
