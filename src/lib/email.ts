import { Resend } from "resend";
import { logger } from "@/lib/logger";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM ?? "InvestHub <no-reply@investhub.app>";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  if (!resend) {
    // Em produção isso é erro de configuração: o usuário vê "e-mail enviado" e nada chega.
    // Logamos como erro para que apareça em `docker compose logs app`.
    const message =
      "RESEND_API_KEY ausente — nenhum e-mail foi enviado. " +
      "Defina a chave no .env e recrie o container (docker compose up -d --force-recreate app).";
    if (process.env.NODE_ENV === "production") {
      logger.error(message, { to, subject });
    } else {
      logger.warn(message, { to, subject });
    }
    return;
  }

  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) {
    logger.error("Falha ao enviar e-mail", { to, subject, from: FROM, error: error.message });
    throw new Error("Não foi possível enviar o e-mail.");
  }

  logger.info("E-mail enviado", { to, subject, id: data?.id });
}

export function verificationEmailTemplate(verifyUrl: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Confirme seu e-mail — InvestHub</h2>
      <p>Clique no botão abaixo para confirmar seu endereço de e-mail e ativar sua conta.</p>
      <p><a href="${verifyUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Confirmar e-mail</a></p>
      <p>Se você não criou uma conta, ignore este e-mail.</p>
    </div>
  `;
}

export function passwordResetEmailTemplate(resetUrl: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Redefinição de senha — InvestHub</h2>
      <p>Recebemos uma solicitação para redefinir sua senha. O link expira em 1 hora.</p>
      <p><a href="${resetUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Redefinir senha</a></p>
      <p>Se você não solicitou isso, ignore este e-mail — sua senha permanecerá inalterada.</p>
    </div>
  `;
}
