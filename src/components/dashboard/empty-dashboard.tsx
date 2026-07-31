import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function EmptyDashboard() {
  return (
    <Card className="flex min-h-[60vh] items-center justify-center border-dashed">
      <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Wallet className="size-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Sua carteira está vazia</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Cadastre suas primeiras transações para ver patrimônio, dividendos e gráficos de
            evolução aqui.
          </p>
        </div>
        <Button asChild>
          <Link href="/portfolio">Cadastrar carteira</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
