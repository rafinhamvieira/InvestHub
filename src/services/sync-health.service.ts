/**
 * Vigia da sincronização de mercado.
 *
 * Duas falhas silenciosas que este serviço cobre, ambas já vividas em produção:
 *
 *  - **o job falha em silêncio** — o `curl` do scheduler recebe erro, ninguém lê o log e a
 *    carteira simplesmente para de atualizar;
 *  - **o job para de existir** — container morto, segredo errado, rede caída. Não há falha
 *    para contar, porque não há execução nenhuma.
 *
 * O primeiro caso é contado; o segundo é detectado por ausência, comparando o horário do
 * último sucesso com o relógio. A verificação por ausência roda no `/api/health`, que o
 * healthcheck do Docker já chama a cada 15 segundos — o vigia ganha um poller de graça.
 *
 * O estado mora no Redis por ser operacional, não de negócio. `FLUSHALL` zera os contadores
 * e, no pior caso, atrasa um alerta até o próximo ciclo.
 */

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { sendEmail, alertEmailTemplate } from "@/lib/email";
import { notificationRepository } from "@/repositories/notification.repository";

const LAST_SUCCESS_KEY = "sync:lastSuccess";
const FAILURES_KEY = "sync:failures";
const ALERT_COOLDOWN_KEY = "sync:alerted";

/** Quantas falhas seguidas antes de avisar. Uma falha isolada é ruído de rede. */
const FAILURE_THRESHOLD = Number(process.env.SYNC_FAILURE_THRESHOLD ?? 3);
/** Sem sucesso por este tempo, o job é considerado parado. Ciclo padrão é de 30 min. */
const STALE_HOURS = Number(process.env.SYNC_STALE_HOURS ?? 3);
/** Silêncio entre avisos: o problema costuma durar horas, o aviso não precisa repetir. */
const ALERT_COOLDOWN_SECONDS = 6 * 60 * 60;

export const syncHealthService = {
  async recordSuccess(): Promise<void> {
    try {
      await redis.set(LAST_SUCCESS_KEY, new Date().toISOString());
      await redis.del(FAILURES_KEY, ALERT_COOLDOWN_KEY);
    } catch {
      // Redis fora do ar não pode derrubar o sync — só perdemos a vigilância.
    }
  },

  async recordFailure(reason: string): Promise<void> {
    try {
      const failures = await redis.incr(FAILURES_KEY);
      logger.warn("Sincronização falhou", { failures, reason });

      if (failures >= FAILURE_THRESHOLD) {
        await this.notify(
          "Sincronização de mercado falhando",
          `A atualização de dados falhou ${failures} vezes seguidas. Último erro: ${reason}`,
        );
      }
    } catch (error) {
      logger.error("Falha ao registrar erro de sincronização", {
        error: (error as Error).message,
      });
    }
  },

  /**
   * Detecta job parado pela ausência de sucesso recente.
   * Chamado pelo health check; nunca lança, para não derrubar o endpoint.
   */
  async checkStaleness(): Promise<{ lastSuccessAt: string | null; stale: boolean }> {
    try {
      const lastSuccess = await redis.get(LAST_SUCCESS_KEY);
      if (!lastSuccess) return { lastSuccessAt: null, stale: false };

      const elapsedHours = (Date.now() - new Date(lastSuccess).getTime()) / (60 * 60 * 1000);
      const stale = elapsedHours > STALE_HOURS;

      if (stale) {
        await this.notify(
          "Sincronização de mercado parada",
          `Nenhuma atualização bem-sucedida há ${Math.floor(elapsedHours)} horas. ` +
            "Verifique o container do scheduler e o CRON_SECRET.",
        );
      }

      return { lastSuccessAt: lastSuccess, stale };
    } catch {
      return { lastSuccessAt: null, stale: false };
    }
  },

  /**
   * Avisa os administradores, no máximo uma vez por janela de silêncio.
   *
   * Sem administrador cadastrado o aviso vira log de erro — melhor do que espalhar problema
   * de infraestrutura para quem só usa a plataforma.
   */
  async notify(title: string, message: string): Promise<void> {
    const alreadyAlerted = await redis.get(ALERT_COOLDOWN_KEY).catch(() => null);
    if (alreadyAlerted) return;

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, email: true, emailNotifications: true },
    });

    if (admins.length === 0) {
      logger.error(`${title} — nenhum administrador cadastrado para avisar`, { message });
      return;
    }

    for (const admin of admins) {
      await notificationRepository.create(admin.id, title, message);

      if (admin.email && admin.emailNotifications) {
        try {
          await sendEmail({
            to: admin.email,
            subject: `InvestHub — ${title}`,
            html: alertEmailTemplate(message, `${process.env.APP_URL}/dashboard`, "Sincronização"),
          });
        } catch (error) {
          logger.error("Falha ao enviar e-mail de alerta de sincronização", {
            error: (error as Error).message,
          });
        }
      }
    }

    await redis.set(ALERT_COOLDOWN_KEY, "1", "EX", ALERT_COOLDOWN_SECONDS).catch(() => null);
    logger.error(title, { message, admins: admins.length });
  },
};
