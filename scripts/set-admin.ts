/**
 * Promove ou rebaixa uma conta.
 *
 *   docker compose run --rm migrate npx tsx scripts/set-admin.ts email@exemplo.com
 *   docker compose run --rm migrate npx tsx scripts/set-admin.ts email@exemplo.com --remove
 *
 * A mudança entra na trilha de auditoria como ação sem autor (feita por linha de comando),
 * e só vale no próximo login: o papel viaja no token da sessão, que dura 30 dias.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const remove = process.argv.includes("--remove");

  if (!email) {
    console.error("Uso: tsx scripts/set-admin.ts email@exemplo.com [--remove]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user) {
    console.error(`Nenhuma conta com o e-mail ${email}.`);
    process.exit(1);
  }

  const role = remove ? "USER" : "ADMIN";
  if (user.role === role) {
    console.log(`${email} já está como ${role}. Nada a fazer.`);
    await prisma.$disconnect();
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: remove ? "ADMIN_ROLE_REVOKED" : "ADMIN_ROLE_GRANTED",
      entity: "User",
      entityId: user.id,
      metadata: { by: "cli", from: user.role, to: role },
    },
  });

  console.log(`${email}: ${user.role} → ${role}. Efetivo no próximo login.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
