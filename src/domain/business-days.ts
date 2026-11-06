/**
 * Dias úteis bancários no Brasil (datas "AAAA-MM-DD").
 *
 * Considera fins de semana, feriados nacionais fixos e os móveis em que os
 * bancos não abrem (Carnaval segunda e terça, Sexta-feira Santa e Corpus
 * Christi). Feriados estaduais e municipais NÃO entram (pendência documentada):
 * como geramos a cobrança com folga (8 dias úteis antes, a regra pede 2 a 10),
 * um feriado local não tira a cobrança da janela.
 */

const FIXED = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC. */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const fromIso = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function addDays(iso: string, n: number): string {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

const holidayCache = new Map<number, Set<string>>();

export function holidays(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    const e = toIso(easter(year));
    set = new Set([
      ...FIXED.map((md) => `${year}-${md}`),
      addDays(e, -48), // Carnaval (segunda)
      addDays(e, -47), // Carnaval (terça)
      addDays(e, -2), // Sexta-feira Santa
      addDays(e, 60), // Corpus Christi
    ]);
    holidayCache.set(year, set);
  }
  return set;
}

export function isBusinessDay(iso: string): boolean {
  const dow = fromIso(iso).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays(Number(iso.slice(0, 4))).has(iso);
}

/** Soma (ou subtrai, com n negativo) dias úteis. */
export function addBusinessDays(iso: string, n: number): string {
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = iso;
  while (left > 0) {
    cur = addDays(cur, step);
    if (isBusinessDay(cur)) left--;
  }
  return cur;
}

/** Quantos dias úteis existem DEPOIS de `from` até `to` (inclusive). Negativo se `to` < `from`. */
export function businessDaysBetween(from: string, to: string): number {
  if (to === from) return 0;
  const step = to > from ? 1 : -1;
  let count = 0;
  let cur = from;
  while (cur !== to) {
    cur = addDays(cur, step);
    if (isBusinessDay(cur)) count += step;
  }
  return count;
}
