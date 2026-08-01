import { redirect } from "next/navigation";

/** A raiz do painel abre na auditoria, que é a tela mais usada no dia a dia. */
export default function AdminHomePage() {
  redirect("/admin/audit");
}
