import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bloco de erro dos formulários — mais visível que uma linha de texto solta. */
export function FormAlert({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <span>{message}</span>
    </div>
  );
}
