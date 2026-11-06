/**
 * Datas de negócio no fuso America/Sao_Paulo, representadas como string
 * "AAAA-MM-DD" (sem horário) para evitar erro de fuso ao virar o dia.
 */
export const TZ = "America/Sao_Paulo";

/** Data de hoje em São Paulo, "AAAA-MM-DD". */
export function todaySP(now: Date = new Date()): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "2026-03-05" -> "05/03/2026" */
export function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/** Instante -> "05/03/2026 14:30" no fuso de São Paulo. */
export function formatDateTimeBR(instant: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(instant));
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
