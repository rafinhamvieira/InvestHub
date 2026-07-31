import { formatCompactCurrency, formatCurrency } from "@/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IndicatorGroup, IndicatorItem } from "@/types/asset-detail";

function formatIndicator(item: IndicatorItem): string {
  if (item.value === null || item.value === "") return "—";
  if (typeof item.value === "string") return item.value;
  switch (item.format) {
    case "currency":
      return formatCurrency(item.value);
    case "compact":
      return formatCompactCurrency(item.value);
    case "percent":
      return `${item.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
    default:
      return item.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
}

export function IndicatorsGrid({ groups }: { groups: IndicatorGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Sem dados fundamentais. Disponível quando as integrações forem ativadas.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((group) => (
        <Card key={group.title}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">{group.title}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {group.items.map((item) => (
              <div key={item.label}>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="font-medium tabular-nums">{formatIndicator(item)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
