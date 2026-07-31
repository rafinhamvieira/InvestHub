"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { extractApiError } from "@/utils/api-error";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Botão global de atualização de cotações/fundamentos dos ativos do usuário. */
export function SyncButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);

  async function sync() {
    setIsSyncing(true);
    const response = await fetch("/api/market/sync", { method: "POST" });
    setIsSyncing(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível atualizar os dados."));
      return;
    }

    const report = await response.json();
    if (report.requested === 0) {
      toast.info("Nenhum ativo para atualizar — cadastre transações ou favoritos primeiro.");
      return;
    }

    toast.success(
      `${report.quotesUpdated} cotação(ões) atualizada(s)` +
        (report.alertsTriggered > 0 ? ` · ${report.alertsTriggered} alerta(s) disparado(s)` : "") +
        (report.failedTickers.length > 0 ? ` · falhou: ${report.failedTickers.join(", ")}` : ""),
    );
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={sync}
      disabled={isSyncing}
      aria-label="Atualizar dados de mercado"
      title="Atualizar dados de mercado"
    >
      <RefreshCw className={cn("size-4", isSyncing && "animate-spin")} />
    </Button>
  );
}
