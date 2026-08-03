import { Check, Minus } from "lucide-react";
import type { Role } from "@prisma/client";
import { Permission, ROLE_LABELS, ROLE_PERMISSIONS, isOwnerRole } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Ordem do menos para o mais poderoso — a matriz é lida da esquerda para a direita. */
const ROLE_ORDER: Role[] = ["USER", "READ_ONLY", "AUDITOR", "SUPPORT", "ADMIN", "SUPER_ADMIN"];

/**
 * O que cada permissão significa em português, para a matriz não ser uma parede de
 * constantes. Chave nova sem rótulo aparece pelo próprio nome — feio, mas nunca ausente.
 */
const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.VIEW_AUDIT]: "Ler e exportar a trilha de auditoria",
  [Permission.VERIFY_AUDIT_INTEGRITY]: "Verificar a integridade da trilha",
  [Permission.MANAGE_USERS]: "Agir sobre contas: nome, e-mail, senha, 2FA, bloqueio, sessões",
  [Permission.MANAGE_BACKUPS]: "Listar, gerar, baixar e ensaiar backups",
  [Permission.RESTORE_BACKUP]: "Restaurar backup sobre o banco em uso",
  [Permission.VIEW_SYSTEM_HEALTH]: "Ver a saúde de banco, cache, sincronização e backup",
  [Permission.VIEW_BUSINESS_METRICS]: "Ver os números do cadastro e da cobertura de mercado",
  [Permission.VIEW_APPLICATION_LOGS]: "Ler o log da aplicação",
  [Permission.MANAGE_PLATFORM]: "Alterar configurações da plataforma",
  [Permission.MANAGE_ROLES]: "Conceder e remover cargos",
  [Permission.VIEW_SECURITY_CENTER]: "Central de segurança",
};

export function RolesView({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cargos</h1>
        <p className="text-sm text-muted-foreground">
          O que cada cargo alcança. Esta tabela é gerada do mapa de permissões em código, não
          escrita à mão — o que você vê aqui é exatamente o que a aplicação verifica.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem pode o quê</CardTitle>
          <CardDescription>
            Nenhum cargo enxerga carteira, patrimônio ou transação de usuário. O backup é a
            única porta para dado financeiro, e por isso pertence só ao cargo mais alto.
          </CardDescription>
        </CardHeader>

        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-72">Permissão</TableHead>
                {ROLE_ORDER.map((role) => (
                  <TableHead key={role} className="text-center">
                    {ROLE_LABELS[role]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.values(Permission).map((permission) => (
                <TableRow key={permission}>
                  <TableCell className="text-sm">
                    {PERMISSION_LABELS[permission] ?? permission}
                  </TableCell>
                  {ROLE_ORDER.map((role) => (
                    <TableCell key={role} className="text-center">
                      {ROLE_PERMISSIONS[role].includes(permission) ? (
                        <Check className="mx-auto size-4 text-success" />
                      ) : (
                        <Minus className="mx-auto size-4 text-muted-foreground/40" />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}

              <TableRow className="bg-muted/40">
                <TableCell className="text-sm font-medium">Contas com o cargo</TableCell>
                {ROLE_ORDER.map((role) => (
                  <TableCell key={role} className="text-center text-sm tabular-nums">
                    {(counts[role] ?? 0).toLocaleString("pt-BR")}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Três capacidades ficam só no cargo mais alto</strong>{" "}
            — conceder cargos, restaurar backup e atestar a própria trilha. Concentrá-las é o
            que mantém a auditoria confiável: quem pode fabricar um administrador, trocar o
            banco inteiro e assinar o laudo sobre si mesmo poderia apagar o próprio rastro.
          </p>
          <p>
            A troca de cargo vale <strong className="text-foreground">na hora</strong> para as
            rotas, que conferem o cargo no banco a cada requisição. O menu e o middleware
            seguem o token, que dura 30 dias — quem foi promovido ou rebaixado precisa sair e
            entrar para a tela acompanhar.
          </p>
          <p className="flex flex-wrap items-center gap-2">
            Cargos que respondem pela plataforma:
            {ROLE_ORDER.filter(isOwnerRole).map((role) => (
              <Badge key={role} variant="warning">
                {ROLE_LABELS[role]}
              </Badge>
            ))}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
