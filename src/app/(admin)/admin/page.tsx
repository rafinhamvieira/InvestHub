import { redirect } from "next/navigation";

/** A raiz abre no painel: é a tela que responde "está tudo de pé?" antes de qualquer ação. */
export default function AdminHomePage() {
  redirect("/admin/dashboard");
}
