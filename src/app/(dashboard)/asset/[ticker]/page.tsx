import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { auth } from "@/lib/auth";
import { assetDetailService } from "@/services/asset-detail.service";
import { AssetHeader } from "@/components/asset/asset-header";
import { AssetTabs } from "@/components/asset/asset-tabs";
import { Card, CardContent } from "@/components/ui/card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  return { title: ticker.toUpperCase() };
}

export default async function AssetPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const session = await auth();
  const detail = await assetDetailService.getDetail(session!.user.id, ticker);

  if (!detail) {
    return (
      <Card className="flex min-h-[60vh] items-center justify-center border-dashed">
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <SearchX className="size-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">{ticker.toUpperCase()} não encontrado</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Este ativo ainda não está cadastrado. Ele é criado automaticamente ao registrar uma
            transação ou meta de alocação com esse ticker.
          </p>
          <Link href="/portfolio" className="text-sm font-medium text-primary hover:underline">
            Ir para Minha Carteira
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <AssetHeader detail={{ ...detail, score: detail.score.score }} />
      <AssetTabs detail={detail} />
    </div>
  );
}
