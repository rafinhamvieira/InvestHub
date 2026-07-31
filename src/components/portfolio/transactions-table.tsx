"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import { formatDateOnly } from "@/utils/date";
import type { TransactionDTO } from "@/types/portfolio";
import { AssetTypeBadge } from "@/components/portfolio/asset-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TransactionsTableProps {
  transactions: TransactionDTO[];
  onEdit: (transaction: TransactionDTO) => void;
}

export function TransactionsTable({ transactions, onEdit }: TransactionsTableProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<TransactionDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setIsDeleting(true);

    const response = await fetch(`/api/portfolio/transactions/${deleting.id}`, {
      method: "DELETE",
    });

    setIsDeleting(false);
    setDeleting(null);

    if (!response.ok) {
      toast.error("Não foi possível excluir a transação.");
      return;
    }

    toast.success("Transação excluída.");
    router.refresh();
  }

  if (transactions.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Nenhuma transação registrada ainda.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Ativo</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Operação</TableHead>
            <TableHead className="text-right">Quantidade</TableHead>
            <TableHead className="text-right">Preço</TableHead>
            <TableHead className="text-right">Taxas</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Corretora</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatDateOnly(transaction.date)}
              </TableCell>
              <TableCell className="font-medium">{transaction.ticker}</TableCell>
              <TableCell>
                <AssetTypeBadge type={transaction.assetType} />
              </TableCell>
              <TableCell>
                <Badge variant={transaction.type === "BUY" ? "success" : "destructive"}>
                  {transaction.type === "BUY" ? "Compra" : "Venda"}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{transaction.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(transaction.price)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(transaction.fees)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatCurrency(transaction.total)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {transaction.brokerName ?? "—"}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(transaction)}>
                      <Pencil className="mr-2 size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleting(transaction)}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir transação</DialogTitle>
            <DialogDescription>
              {deleting &&
                `${deleting.type === "BUY" ? "Compra" : "Venda"} de ${deleting.quantity} ${deleting.ticker} em ${formatDateOnly(deleting.date)}. A posição será recalculada. Esta ação não pode ser desfeita.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
