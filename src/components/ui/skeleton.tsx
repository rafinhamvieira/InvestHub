import { cn } from "@/lib/utils";

/** Espaço reservado enquanto o dado não chegou — evita o salto de layout do conteúdo vazio. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
