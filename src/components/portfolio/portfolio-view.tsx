"use client";

import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import type { PortfolioData, TransactionDTO } from "@/types/portfolio";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PositionsTable } from "@/components/portfolio/positions-table";
import { TransactionsTable } from "@/components/portfolio/transactions-table";
import { TransactionDialog } from "@/components/portfolio/transaction-dialog";
import { ImportDialog } from "@/components/portfolio/import-dialog";
import { ExportMenu } from "@/components/portfolio/export-menu";

export function PortfolioView({ data }: { data: PortfolioData }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionDTO | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(transaction: TransactionDTO) {
    setEditing(transaction);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Minha Carteira</h1>
          <p className="text-sm text-muted-foreground">
            Posições consolidadas e histórico de transações.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportMenu data={data} />
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload />
            Importar
          </Button>
          <Button onClick={openCreate}>
            <Plus />
            Nova transação
          </Button>
        </div>
      </div>

      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions">Posições ({data.positions.length})</TabsTrigger>
          <TabsTrigger value="transactions">Transações ({data.transactions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="positions">
          <Card>
            <CardContent className="p-0">
              <PositionsTable positions={data.positions} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardContent className="p-0">
              <TransactionsTable transactions={data.transactions} onEdit={openEdit} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transaction={editing}
        brokers={data.brokers}
      />

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
