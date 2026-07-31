"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  type IChartApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from "lightweight-charts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OhlcPoint } from "@/types/asset-detail";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
  { label: "5A", days: 1825 },
  { label: "Máx", days: Infinity },
] as const;

export function CandleChart({ data }: { data: OhlcPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();
  const [rangeDays, setRangeDays] = useState<number>(365);

  const visibleData = useMemo(() => {
    if (!Number.isFinite(rangeDays)) return data;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return data.filter((point) => point.time >= cutoffStr);
  }, [data, rangeDays]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || visibleData.length === 0) return;

    const isDark = resolvedTheme === "dark";
    const chart = createChart(container, {
      height: 380,
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: isDark ? "rgba(148,163,184,0.08)" : "rgba(100,116,139,0.1)" },
        horzLines: { color: isDark ? "rgba(148,163,184,0.08)" : "rgba(100,116,139,0.1)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const candles = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });
    candles.setData(
      visibleData.map<CandlestickData>((p) => ({
        time: p.time as Time,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      })),
    );

    const hasVolume = visibleData.some((p) => p.volume !== null && p.volume > 0);
    if (hasVolume) {
      const volume = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volume.setData(
        visibleData.map<HistogramData>((p) => ({
          time: p.time as Time,
          value: p.volume ?? 0,
          color:
            p.close >= p.open ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)",
        })),
      );
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [visibleData, resolvedTheme]);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          Sem histórico de cotações. Disponível quando as integrações forem ativadas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-1">
        {RANGES.map((range) => (
          <Button
            key={range.label}
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2.5 text-xs",
              rangeDays === range.days && "bg-accent text-foreground",
            )}
            onClick={() => setRangeDays(range.days)}
          >
            {range.label}
          </Button>
        ))}
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
