"use client";

import { Newspaper } from "lucide-react";
import { formatCurrency, formatSignedPercent } from "@/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CandleChart } from "@/components/asset/candle-chart";
import { IndicatorsGrid } from "@/components/asset/indicators-grid";
import { DividendsPanel } from "@/components/asset/dividends-panel";
import { HistoryPanel } from "@/components/asset/history-panel";
import { ValuationPanel } from "@/components/asset/valuation-panel";
import { ScorePanel } from "@/components/asset/score-panel";
import { cn } from "@/lib/utils";
import type { AssetDetail } from "@/types/asset-detail";

export function AssetTabs({ detail }: { detail: AssetDetail }) {
  return (
    <Tabs defaultValue="overview">
      <TabsList className="flex-wrap">
        <TabsTrigger value="overview">Resumo</TabsTrigger>
        <TabsTrigger value="score">Nota</TabsTrigger>
        <TabsTrigger value="indicators">Indicadores</TabsTrigger>
        <TabsTrigger value="dividends">Dividendos</TabsTrigger>
        <TabsTrigger value="valuation">Valuation</TabsTrigger>
        <TabsTrigger value="history">Histórico</TabsTrigger>
        <TabsTrigger value="news">Notícias</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cotação</CardTitle>
          </CardHeader>
          <CardContent>
            <CandleChart data={detail.ohlc} />
          </CardContent>
        </Card>

        {detail.position && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sua posição</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div>
                <p className="text-xs text-muted-foreground">Quantidade</p>
                <p className="font-medium tabular-nums">{detail.position.quantity}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Preço médio</p>
                <p className="font-medium tabular-nums">
                  {formatCurrency(detail.position.averagePrice)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Investido</p>
                <p className="font-medium tabular-nums">
                  {formatCurrency(detail.position.totalInvested)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor atual</p>
                <p className="font-medium tabular-nums">
                  {formatCurrency(detail.position.currentValue)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Resultado</p>
                <p
                  className={cn(
                    "font-medium tabular-nums",
                    detail.position.profit >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {formatCurrency(detail.position.profit)}{" "}
                  <span className="text-xs">
                    ({formatSignedPercent(detail.position.profitPercent)})
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {detail.description && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sobre</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">{detail.description}</p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="score">
        <ScorePanel score={detail.score} />
      </TabsContent>

      <TabsContent value="indicators">
        <IndicatorsGrid groups={detail.indicatorGroups} />
      </TabsContent>

      <TabsContent value="dividends">
        <DividendsPanel dividends={detail.dividends} byYear={detail.dividendsByYear} />
      </TabsContent>

      <TabsContent value="valuation">
        <ValuationPanel summary={detail.valuation} />
      </TabsContent>

      <TabsContent value="history">
        <HistoryPanel series={detail.historySeries} />
      </TabsContent>

      <TabsContent value="news">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Newspaper className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Notícias e resultados serão exibidos aqui quando as integrações de mercado forem
              ativadas.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
