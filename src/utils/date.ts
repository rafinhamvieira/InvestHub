/**
 * Datas de calendário (data da operação, data-ex, data de pagamento) representam um
 * DIA, não um instante. Guardamos essas datas à meia-noite UTC e formatamos sempre em
 * UTC — caso contrário, no Brasil (UTC-3) a meia-noite UTC é exibida como 21h do dia
 * anterior, e o usuário vê um dia a menos do que informou.
 *
 * Para instantes de verdade (criado em, disparado em) continue usando formatação local:
 * ali o fuso do usuário é justamente o que interessa.
 */

/** Converte "yyyy-mm-dd" ou Date para meia-noite UTC do mesmo dia do calendário. */
export function toUtcDateOnly(value: string | Date): Date {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    }
    const parsed = new Date(value);
    return new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
    );
  }
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Formata como dd/MM/yyyy usando os componentes UTC, sem deslocar por fuso. */
export function formatDateOnly(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** Formata para o valor de um <input type="date"> (yyyy-MM-dd), também em UTC. */
export function toDateInputValue(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** Ano do calendário em UTC — usado para agrupar proventos por ano. */
export function getUtcYear(value: string | Date): number {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.getUTCFullYear();
}
