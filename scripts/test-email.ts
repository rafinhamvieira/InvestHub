/**
 * Testa a configuração de e-mail sem passar pela interface.
 *
 *   docker compose run --rm migrate npx tsx scripts/test-email.ts destino@exemplo.com
 *
 * Mostra qual provedor está ativo e o erro exato em caso de falha.
 */
import { sendEmail } from "../src/lib/email";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Uso: tsx scripts/test-email.ts destino@exemplo.com");
    process.exit(1);
  }

  const provider = process.env.EMAIL_PROVIDER || (process.env.SMTP_HOST ? "smtp (deduzido)" : "resend (deduzido)");
  console.log(`Provedor: ${provider}`);
  console.log(`Remetente: ${process.env.EMAIL_FROM}`);
  console.log(`Destinatário: ${to}`);
  console.log("Enviando...");

  await sendEmail({
    to,
    subject: "Teste de envio — InvestHub",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Funcionou!</h2>
        <p>Se você está lendo isto, a configuração de e-mail do InvestHub está correta.</p>
        <p style="color:#666;font-size:12px">Enviado em ${new Date().toLocaleString("pt-BR")}</p>
      </div>
    `,
  });

  console.log("\nEnviado com sucesso. Confira a caixa de entrada (e o spam).");
}

main().catch((error) => {
  console.error("\nFALHOU:", error.message);
  console.error("\nVeja o log acima para o motivo exato retornado pelo servidor de e-mail.");
  process.exit(1);
});
