import { auditLogRepository } from "@/repositories/audit-log.repository";
import { loginAuditRepository } from "@/repositories/login-audit.repository";
import { mapActionRow, mapLoginRow, mergeEntries } from "@/utils/audit-mapper";
import type { AuditFilters, AuditPage } from "@/types/audit";

/** Teto da página, para uma URL forjada não pedir "pageSize=100000" e derrubar o banco. */
const MAX_PAGE_SIZE = 100;
/**
 * Profundidade máxima de paginação.
 *
 * A fusão das duas trilhas exige trazer `page × pageSize` linhas de cada tabela antes de
 * ordenar — é o preço de manter as duas separadas na gravação. Com o teto, o pior caso é
 * ler 4.000 linhas; quem precisa ir mais fundo usa os filtros de período, que é o que
 * qualquer investigação de verdade faz.
 */
const MAX_PAGE = 40;

export const adminAuditService = {
  async list(filters: AuditFilters): Promise<AuditPage> {
    const pageSize = Math.min(Math.max(filters.pageSize, 1), MAX_PAGE_SIZE);
    const page = Math.min(Math.max(filters.page, 1), MAX_PAGE);
    const scan = { ...filters, page: 1, pageSize: page * pageSize };

    // Categoria "Acessos" não existe na trilha de ações e vice-versa: o filtro por
    // categoria decide qual das duas fontes é consultada.
    const wantsLogin = !filters.category || filters.category === "LOGIN";
    const wantsActions = !filters.category || filters.category !== "LOGIN";

    const [actions, logins] = await Promise.all([
      wantsActions ? auditLogRepository.listActions(scan) : Promise.resolve({ rows: [], total: 0 }),
      wantsLogin ? loginAuditRepository.listAll(scan) : Promise.resolve({ rows: [], total: 0 }),
    ]);

    const entries = mergeEntries(
      [actions.rows.map(mapActionRow), logins.rows.map(mapLoginRow)],
      page,
      pageSize,
    );

    return { entries, total: actions.total + logins.total, page, pageSize };
  },
};
