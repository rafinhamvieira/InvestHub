import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { alertService } from "@/services/alert.service";
import { AlertsView, type AlertRow } from "@/components/alerts/alerts-view";

export const metadata: Metadata = { title: "Alertas" };

export default async function AlertsPage() {
  const session = await auth();
  const alerts = await alertService.list(session!.user.id);

  const rows: AlertRow[] = alerts.map((alert) => ({
    id: alert.id,
    ticker: alert.asset.ticker,
    assetName: alert.asset.name,
    type: alert.type,
    targetValue: Number(alert.targetValue),
    status: alert.status,
    channel: alert.channel,
    triggeredAt: alert.triggeredAt?.toISOString() ?? null,
    createdAt: alert.createdAt.toISOString(),
  }));

  return <AlertsView alerts={rows} />;
}
