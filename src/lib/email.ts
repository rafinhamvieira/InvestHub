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

/**
 * Casca visual dos e-mails transacionais.
 *
 * Usamos texto estilizado em vez de imagem: clientes de e-mail bloqueiam imagens
 * remotas por padrão, e um logo que não carrega passa impressão de mensagem suspeita
 * justamente onde a confiança importa mais.
 */
function emailLayout(title: string, body: string): string {
  return `
  <div style="background:#F4F6FA;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E3E8F0;">
      <div style="background:#101F3C;padding:24px 28px;">
        <div style="font-size:22px;font-weight:700;letter-spacing:-0.4px;color:#FFFFFF;">
          INVEST<span style="color:#D9A73F;">HUB</span>
        </div>
        <div style="margin-top:6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#D9A73F;">
          Invista melhor. Viva o futuro.
        </div>
      </div>
      <div style="padding:28px;color:#1B2436;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:19px;color:#101F3C;">${title}</h1>
        ${body}
      </div>
      <div style="padding:16px 28px;background:#FAFBFD;border-top:1px solid #E3E8F0;color:#7A879C;font-size:12px;">
        Este é um e-mail automático do InvestHub — não responda a esta mensagem.
      </div>
    </div>
  </div>`;
}

function emailButton(url: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${url}" style="background:#101F3C;color:#FFFFFF;padding:13px 24px;border-radius:9px;text-decoration:none;display:inline-block;font-weight:600;font-size:15px;">${label}</a>
  </p>
  <p style="color:#7A879C;font-size:12px;margin:0;">
    Se o botão não funcionar, copie e cole este endereço no navegador:<br />
    <span style="color:#3A4A63;word-break:break-all;">${url}</span>
  </p>`;
}

export function verificationEmailTemplate(verifyUrl: string): string {
  return emailLayout(
    "Confirme seu e-mail",
    `<p style="margin:0;">Falta pouco para ativar sua conta. Clique no botão abaixo para confirmar seu endereço de e-mail.</p>
     ${emailButton(verifyUrl, "Confirmar e-mail")}
     <p style="margin:20px 0 0;color:#7A879C;font-size:13px;">Se você não criou uma conta no InvestHub, ignore esta mensagem.</p>`,
  );
}

export function alertEmailTemplate(message: string, assetUrl: string, ticker: string): string {
  return emailLayout(
    `Alerta disparado — ${ticker}`,
    `<p style="margin:0;">${message}</p>
     ${emailButton(assetUrl, `Ver ${ticker}`)}
     <p style="margin:20px 0 0;color:#7A879C;font-size:13px;">Para deixar de receber alertas por e-mail, ajuste em Configurações → Preferências.</p>`,
  );
}

/**
 * Aviso ao usuário de que um administrador mexeu na conta dele.
 *
 * Sai em toda ação administrativa, sem exceção e sem opção de desligar: é o que impede que
 * alteração feita pelo painel passe despercebida pelo dono da conta. Se a mudança não foi
 * combinada, o usuário fica sabendo na hora.
 */
export function adminActionEmailTemplate(action: string, detail: string): string {
  return emailLayout(
    "Alteração na sua conta",
    `<p style="margin:0;"><strong>${action}</strong></p>
     <p style="margin:12px 0 0;">${detail}</p>
     <p style="margin:20px 0 0;color:#7A879C;font-size:13px;">Se você não reconhece esta alteração, entre em contato imediatamente e troque sua senha.</p>`,
  );
}

export function passwordResetEmailTemplate(resetUrl: string): string {
  return emailLayout(
    "Redefinição de senha",
    `<p style="margin:0;">Recebemos uma solicitação para redefinir a senha da sua conta. <strong>O link expira em 1 hora.</strong></p>
     ${emailButton(resetUrl, "Redefinir senha")}
     <p style="margin:20px 0 0;color:#7A879C;font-size:13px;">Se você não solicitou isso, ignore esta mensagem — sua senha permanece inalterada.</p>`,
  );
}
