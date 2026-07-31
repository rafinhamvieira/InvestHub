import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@/lib/logger";

const FROM = process.env.EMAIL_FROM ?? "InvestHub <no-reply@investhub.local>";

type EmailProvider = "smtp" | "resend" | "none";

/**
 * Provedor de envio. Definido por EMAIL_PROVIDER; se ausente, é deduzido pelas
 * credenciais presentes — SMTP tem prioridade por não ter restrição de destinatário.
 */
function resolveProvider(): EmailProvider {
  const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === "smtp" || explicit === "resend") return explicit;
  if (process.env.SMTP_HOST) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return "none";
}

declare global {
  // eslint-disable-next-line no-var
  var __smtpTransporter: Transporter | undefined;
}

/** Transporter reaproveitado entre requisições (mantém o pool de conexões SMTP). */
function getTransporter(): Transporter {
  if (global.__smtpTransporter) return global.__smtpTransporter;

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 usa TLS implícito; 587 começa em texto puro e sobe para TLS via STARTTLS.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  global.__smtpTransporter = transporter;
  return transporter;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const provider = resolveProvider();

  if (provider === "none") {
    // Em produção isso é erro de configuração: o usuário vê "e-mail enviado" e nada chega.
    // Logamos como erro para que apareça em `docker compose logs app`.
    const message =
      "Nenhum provedor de e-mail configurado — nada foi enviado. " +
      "Defina SMTP_HOST (recomendado) ou RESEND_API_KEY no .env e recrie o container " +
      "(docker compose up -d --force-recreate app).";
    if (process.env.NODE_ENV === "production") {
      logger.error(message, { to, subject });
    } else {
      logger.warn(message, { to, subject });
    }
    return;
  }

  if (provider === "smtp") {
    try {
      const info = await getTransporter().sendMail({ from: FROM, to, subject, html });
      logger.info("E-mail enviado", { provider, to, subject, id: info.messageId });
    } catch (error) {
      logger.error("Falha ao enviar e-mail", {
        provider,
        to,
        subject,
        from: FROM,
        error: (error as Error).message,
      });
      throw new Error("Não foi possível enviar o e-mail.");
    }
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) {
    logger.error("Falha ao enviar e-mail", {
      provider,
      to,
      subject,
      from: FROM,
      error: error.message,
    });
    throw new Error("Não foi possível enviar o e-mail.");
  }

  logger.info("E-mail enviado", { provider, to, subject, id: data?.id });
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
