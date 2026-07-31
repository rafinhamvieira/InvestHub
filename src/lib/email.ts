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
    logger.warn("RESEND_API_KEY não configurada — e-mail não enviado, apenas logado.", {
      to,
      subject,
    });
    return;
  }

  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) {
    logger.error("Falha ao enviar e-mail", { to, subject, error: error.message });
    throw new Error("Não foi possível enviar o e-mail.");
  }
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
