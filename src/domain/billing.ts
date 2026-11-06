/**
 * Regras de cobrança do transporte escolar (funções puras).
 *
 * Competência = mês de referência, sempre "AAAA-MM-01".
 * Valores em centavos. Datas "AAAA-MM-DD" no fuso de São Paulo.
 */
import { addBusinessDays, businessDaysBetween } from "./business-days";
import { discountedAmount, type Discount, type MonthsPolicy } from "./registration";

export interface ContractTerms {
  startDate: string;
  endDate: string | null;
  dueDay: number;
  monthsPolicy: MonthsPolicy;
  customMonths: number[] | null;
  monthlyAmountCents: number;
  discount: Discount;
  prorataFirstMonth: boolean;
}

/** Antecedência da geração: a regra do Pix Automático pede 2 a 10 dias úteis; usamos 8. */
export const LEAD_BUSINESS_DAYS = 8;
/** Mínimo de dias úteis antes do vencimento para mandar ao Pix Automático. */
export const MIN_AUTOMATIC_BUSINESS_DAYS = 2;
/** Quantas competências atrasadas, no máximo, geramos de uma vez (contrato antigo cadastrado agora). */
export const MAX_CATCH_UP = 3;

export const competenceOf = (iso: string) => `${iso.slice(0, 7)}-01`;

export function addMonths(competence: string, n: number): string {
  const [y, m] = competence.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export function daysInMonth(competence: string): number {
  const [y, m] = competence.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Vencimento da competência. Dia 31 em fevereiro vira o último dia do mês. */
export function dueDateFor(competence: string, dueDay: number): string {
  const day = Math.min(dueDay, daysInMonth(competence));
  return `${competence.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/** O mês tem cobrança segundo a política do contrato? (10 meses = sem janeiro e julho) */
export function isBillableMonth(terms: Pick<ContractTerms, "monthsPolicy" | "customMonths">, competence: string): boolean {
  const month = Number(competence.slice(5, 7));
  if (terms.monthsPolicy === "dez") return month !== 1 && month !== 7;
  if (terms.monthsPolicy === "personalizada") return (terms.customMonths ?? []).includes(month);
  return true;
}

/** A competência está dentro da vigência do contrato? */
export function isWithinContract(terms: Pick<ContractTerms, "startDate" | "endDate">, competence: string): boolean {
  if (competence < competenceOf(terms.startDate)) return false;
  if (terms.endDate && competence > competenceOf(terms.endDate)) return false;
  return true;
}

/** Primeira competência cobrável: o mês de início, ou o próximo mês com cobrança. */
export function firstCompetence(terms: ContractTerms): string | null {
  let c = competenceOf(terms.startDate);
  for (let i = 0; i < 24; i++) {
    if (!isWithinContract(terms, c)) return null;
    if (isBillableMonth(terms, c)) return c;
    c = addMonths(c, 1);
  }
  return null;
}

/**
 * Valor da competência. O desconto vale sempre; o proporcional só no mês de
 * início e só se o contrato pedir (dias corridos restantes / dias do mês,
 * arredondado para baixo em centavos, a favor do pagador). D5.
 */
export function chargeAmount(terms: ContractTerms, competence: string): { amountCents: number; discountCents: number; prorated: boolean } {
  const base = discountedAmount(terms.monthlyAmountCents, terms.discount);
  const discountCents = terms.monthlyAmountCents - base;
  const startDay = Number(terms.startDate.slice(8, 10));
  if (terms.prorataFirstMonth && competence === competenceOf(terms.startDate) && startDay > 1) {
    const total = daysInMonth(competence);
    const used = total - startDay + 1;
    return { amountCents: Math.max(1, Math.floor((base * used) / total)), discountCents, prorated: true };
  }
  return { amountCents: base, discountCents, prorated: false };
}

/** Data em que a cobrança da competência deve ser gerada. */
export function generationDate(competence: string, dueDay: number): string {
  return addBusinessDays(dueDateFor(competence, dueDay), -LEAD_BUSINESS_DAYS);
}

/**
 * Competências que já deveriam ter cobrança e ainda não têm.
 * Pula meses sem cobrança e fora da vigência. Limita o atraso a MAX_CATCH_UP.
 */
export function competencesToGenerate(terms: ContractTerms, today: string, existing: Set<string>): string[] {
  const first = firstCompetence(terms);
  if (!first) return [];
  const out: string[] = [];
  let c = first;
  for (let i = 0; i < 36; i++) {
    if (!isWithinContract(terms, c)) break;
    if (generationDate(c, terms.dueDay) > today) break;
    if (isBillableMonth(terms, c) && !existing.has(c)) out.push(c);
    c = addMonths(c, 1);
  }
  return out.slice(-MAX_CATCH_UP);
}

/** Vencimento efetivo: se a data da regra já passou, vence hoje (nunca criamos cobrança vencida). */
export function effectiveDueDate(ruleDueDate: string, today: string): string {
  return ruleDueDate < today ? today : ruleDueDate;
}

/**
 * Cobrança híbrida: Pix Automático só com autorização ativa e com a antecedência
 * mínima exigida; caso contrário, Pix comum (com lembretes).
 */
export function chooseMethod(input: { authorizationActive: boolean; dueDate: string; today: string }): "pix_automatico" | "pix_comum" {
  return input.authorizationActive && businessDaysBetween(input.today, input.dueDate) >= MIN_AUTOMATIC_BUSINESS_DAYS
    ? "pix_automatico"
    : "pix_comum";
}

/**
 * D8: o contrato aguardando adesão passa para Pix comum quando o link expira
 * sem pagamento, ou quando passaram 7 dias da criação sem nenhum link gerado.
 */
export function shouldFallBackToPixComum(input: {
  billingMode: "aguardando_adesao" | "pix_automatico" | "pix_comum";
  contractCreatedAt: string;
  liveLinkExpiresAt: string | null;
  now: string;
  graceDays: number;
}): boolean {
  if (input.billingMode !== "aguardando_adesao") return false;
  if (input.liveLinkExpiresAt) return input.liveLinkExpiresAt <= input.now;
  const limit = new Date(new Date(input.contractCreatedAt).getTime() + input.graceDays * 86_400_000).toISOString();
  return limit <= input.now;
}

// --- Status da cobrança --------------------------------------------------------

export type ChargeStatus = "agendada" | "enviada" | "paga" | "atrasada" | "cancelada";

const ALLOWED: Record<ChargeStatus, ChargeStatus[]> = {
  agendada: ["enviada", "paga", "cancelada"],
  enviada: ["paga", "atrasada", "cancelada"],
  atrasada: ["paga", "cancelada"],
  paga: [], // final: estorno é tratado como revisão, não como volta de status
  cancelada: [],
};

/** O status só avança. Eventos atrasados ou repetidos nunca fazem "paga" voltar. */
export function canTransition(from: ChargeStatus, to: ChargeStatus): boolean {
  return from === to || ALLOWED[from].includes(to);
}

/** Vira "atrasada" no dia seguinte ao vencimento, se ainda não foi paga. */
export function isOverdue(status: ChargeStatus, dueDate: string, today: string): boolean {
  return (status === "enviada" || status === "agendada") && dueDate < today;
}

/** Texto da cobrança no app do banco do pagador. */
export function chargeDescription(studentFirstName: string, competence: string): string {
  return `Transporte escolar ${studentFirstName} ${competence.slice(5, 7)}/${competence.slice(0, 4)}`;
}
