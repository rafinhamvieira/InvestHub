import { prisma } from "@/lib/prisma";

/**
 * Proventos efetivamente creditados ao usuário.
 *
 * O registro existe para dois fins: servir de trava de idempotência da notificação de
 * crédito (o par userId+dividendId é único, então o mesmo pagamento nunca notifica duas
 * vezes) e guardar a quantidade que o usuário tinha na data-com, que muda com o tempo.
 */
export const dividendReceiptRepository = {
  /** Cria o recibo; devolve false se o usuário já tinha esse provento registrado. */
  async createIfMissing(
    userId: string,
    dividendId: string,
    quantityHeld: number,
    totalReceived: number,
  ): Promise<boolean> {
    const existing = await prisma.dividendReceipt.findUnique({
      where: { userId_dividendId: { userId, dividendId } },
      select: { id: true },
    });
    if (existing) return false;

    await prisma.dividendReceipt.create({
      data: { userId, dividendId, quantityHeld, totalReceived },
    });
    return true;
  },

  listByUser(userId: string) {
    return prisma.dividendReceipt.findMany({
      where: { userId },
      include: { dividend: { include: { asset: { select: { ticker: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
  },
};
