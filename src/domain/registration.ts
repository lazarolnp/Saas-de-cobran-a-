/**
 * Regras de cadastro de aluno + responsável + contrato.
 * Usadas pelo formulário único E pela importação de planilha, para que as
 * duas portas de entrada validem exatamente igual. Funções puras (sem I/O).
 */
import { isValidCpf, normalizeBrPhone, onlyDigits } from "@/lib/br";
import { parseBRL } from "@/lib/money";

export type Shift = "manha" | "tarde" | "integral" | "noite";
export type MonthsPolicy = "doze" | "dez" | "personalizada";
export type DiscountType = "nenhum" | "valor" | "percentual";

export interface Discount {
  type: DiscountType;
  /** centavos ('valor') ou pontos-base ('percentual': 1000 = 10%). */
  value: number;
}

/** Cadastro já validado e normalizado. CPF ainda em claro: só existe na memória do servidor. */
export interface Registration {
  studentName: string;
  school: string | null;
  grade: string | null;
  shift: Shift;
  routeId: string | null;
  routeName: string | null;
  guardianName: string;
  cpf: string;
  whatsapp: string;
  email: string | null;
  monthlyAmountCents: number;
  dueDay: number;
  startDate: string;
  monthsPolicy: MonthsPolicy;
  customMonths: number[] | null;
  /** null = não informado (o desconto de irmão pode ser aplicado automaticamente). */
  discount: Discount | null;
  prorataFirstMonth: boolean;
}

export type RawRegistration = Partial<Record<keyof typeof FIELD_LABELS, string | null | undefined>>;

export const FIELD_LABELS = {
  studentName: "Nome do aluno",
  school: "Escola",
  grade: "Série",
  shift: "Turno",
  route: "Rota",
  guardianName: "Nome do responsável",
  cpf: "CPF do responsável",
  whatsapp: "WhatsApp",
  email: "E-mail",
  monthlyAmount: "Valor mensal",
  dueDay: "Dia de vencimento",
  startDate: "Início",
  months: "Meses com cobrança",
  discount: "Desconto",
  prorata: "Primeiro mês proporcional",
} as const;

export type FieldErrors = Partial<Record<keyof typeof FIELD_LABELS, string>>;

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function parseShift(v: string): Shift | null {
  const s = strip(v);
  if (["manha", "m", "matutino"].includes(s)) return "manha";
  if (["tarde", "t", "vespertino"].includes(s)) return "tarde";
  if (["integral", "i", "dia todo"].includes(s)) return "integral";
  if (["noite", "n", "noturno"].includes(s)) return "noite";
  return null;
}

const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * "12" | "" -> 12 meses; "10" -> sem janeiro e julho;
 * "2-6, 8-12" ou "fev-jun, ago-dez" ou "3,4,5" -> personalizada.
 */
export function parseMonthsPolicy(v: string): { policy: MonthsPolicy; customMonths: number[] | null } | null {
  const s = strip(v).replace(/\s+/g, "").replace(/meses?$/, "");
  if (s === "" || s === "12") return { policy: "doze", customMonths: null };
  if (s === "10") return { policy: "dez", customMonths: null };
  const toMonth = (t: string) => {
    if (/^\d{1,2}$/.test(t)) return Number(t);
    const i = MONTH_NAMES.indexOf(t.slice(0, 3));
    return i >= 0 ? i + 1 : NaN;
  };
  const months = new Set<number>();
  for (const part of s.split(/[,;]/).filter(Boolean)) {
    const [a, b] = part.split("-");
    const start = toMonth(a);
    const end = b === undefined ? start : toMonth(b);
    if (!(start >= 1 && start <= 12 && end >= 1 && end <= 12 && start <= end)) return null;
    for (let m = start; m <= end; m++) months.add(m);
  }
  if (months.size === 0) return null;
  const list = [...months].sort((x, y) => x - y);
  if (list.length === 12) return { policy: "doze", customMonths: null };
  return { policy: "personalizada", customMonths: list };
}

/** "" -> null (não informado); "0" -> sem desconto; "10%" -> percentual; "50,00" -> valor. */
export function parseDiscount(v: string): Discount | null | "invalido" {
  const s = v.trim();
  if (s === "") return null;
  if (s.endsWith("%")) {
    const n = Number(s.slice(0, -1).trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) return "invalido";
    const bp = Math.round(n * 100);
    return bp === 0 ? { type: "nenhum", value: 0 } : { type: "percentual", value: bp };
  }
  const cents = parseBRL(s);
  if (cents === null) return "invalido";
  return cents === 0 ? { type: "nenhum", value: 0 } : { type: "valor", value: cents };
}

/** "05/03/2026", "5/3/26" ou "2026-03-05" -> "2026-03-05". */
export function parseDateBR(v: string): string | null {
  const s = v.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 2020 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}

/** Valor da mensalidade com desconto, em centavos (nunca negativo). */
export function discountedAmount(amountCents: number, discount: Discount | null): number {
  if (!discount || discount.type === "nenhum") return amountCents;
  const off = discount.type === "valor" ? discount.value : Math.round((amountCents * discount.value) / 10000);
  return Math.max(0, amountCents - off);
}

/**
 * Valida e normaliza um cadastro. `today` (AAAA-MM-DD) é o padrão do início.
 * Retorna os erros por campo, com mensagens que dizem o que fazer.
 */
export function validateRegistration(raw: RawRegistration, today: string): { ok: true; data: Registration } | { ok: false; errors: FieldErrors } {
  const e: FieldErrors = {};
  const v = (k: keyof typeof FIELD_LABELS) => (raw[k] ?? "").toString().trim();

  const studentName = v("studentName");
  if (studentName.length < 2) e.studentName = "Escreva o nome do aluno.";
  else if (studentName.length > 120) e.studentName = "Nome muito longo (máximo 120 letras).";

  const shift = parseShift(v("shift") || "");
  if (!shift) e.shift = "Escolha o turno: manhã, tarde, integral ou noite.";

  const guardianName = v("guardianName");
  if (guardianName.length < 2) e.guardianName = "Escreva o nome de quem paga.";

  const cpf = onlyDigits(v("cpf"));
  if (!isValidCpf(cpf)) e.cpf = "CPF inválido. Confira os 11 números.";

  const whatsapp = normalizeBrPhone(v("whatsapp"));
  if (!whatsapp) e.whatsapp = "WhatsApp inválido. Use DDD + número, ex.: (11) 98765-4321.";

  const email = v("email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = "E-mail inválido (ou deixe em branco).";

  const amount = parseBRL(v("monthlyAmount"));
  if (amount === null) e.monthlyAmount = "Valor inválido. Exemplo: 350,00.";
  else if (amount < 100) e.monthlyAmount = "O valor mínimo é R$ 1,00.";
  else if (amount > 10_000_00) e.monthlyAmount = "Valor acima de R$ 10.000,00. Confira.";

  const dueDayRaw = v("dueDay");
  const dueDay = /^\d{1,2}$/.test(dueDayRaw) ? Number(dueDayRaw) : NaN;
  if (!(dueDay >= 1 && dueDay <= 31)) e.dueDay = "Dia de vencimento entre 1 e 31.";

  const startDate = v("startDate") ? parseDateBR(v("startDate")) : today;
  if (!startDate) e.startDate = "Data inválida. Use dia/mês/ano, ex.: 01/03/2026.";

  const months = parseMonthsPolicy(v("months"));
  if (!months) e.months = 'Use 12, 10 (sem janeiro e julho) ou os meses, ex.: "fev-jun, ago-dez".';

  const discount = parseDiscount(v("discount"));
  if (discount === "invalido") e.discount = 'Desconto inválido. Use "10%" ou um valor como "50,00".';
  else if (discount && amount !== null && discountedAmount(amount, discount) < 100) e.discount = "O desconto não pode zerar a mensalidade.";

  const prorata = strip(v("prorata"));
  if (prorata && !["sim", "s", "nao", "n", "on", "true", "false"].includes(prorata)) e.prorata = 'Use "sim" ou "não".';

  if (Object.keys(e).length) return { ok: false, errors: e };

  return {
    ok: true,
    data: {
      studentName: studentName.replace(/\s+/g, " "),
      school: v("school") || null,
      grade: v("grade") || null,
      shift: shift!,
      routeId: /^[0-9a-f-]{36}$/i.test(v("route")) ? v("route") : null,
      routeName: /^[0-9a-f-]{36}$/i.test(v("route")) ? null : v("route") || null,
      guardianName: guardianName.replace(/\s+/g, " "),
      cpf,
      whatsapp: whatsapp!,
      email: email || null,
      monthlyAmountCents: amount!,
      dueDay,
      startDate: startDate!,
      monthsPolicy: months!.policy,
      customMonths: months!.customMonths,
      discount: discount as Discount | null,
      prorataFirstMonth: ["sim", "s", "on", "true"].includes(prorata),
    },
  };
}

/**
 * D6: desconto de irmãos. Se o desconto não foi informado e o pagador já tem
 * outro contrato aberto (no banco ou numa linha anterior da mesma planilha),
 * aplica o desconto padrão do tenant. O 1º aluno do pagador paga cheio.
 */
export function applySiblingDiscount(
  explicit: Discount | null,
  payerOpenContracts: number,
  tenantSiblingDiscount: Discount,
): { discount: Discount; auto: boolean } {
  if (explicit) return { discount: explicit, auto: false };
  if (payerOpenContracts >= 1 && tenantSiblingDiscount.type !== "nenhum") return { discount: tenantSiblingDiscount, auto: true };
  return { discount: { type: "nenhum", value: 0 }, auto: false };
}
