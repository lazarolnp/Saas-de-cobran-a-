/**
 * Nome provisório do produto. Troque aqui e ele muda no app inteiro.
 */
export const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || "[NOME_DO_PRODUTO]";

/** Faixas de preço do SaaS (placeholder do MVP; cobrança manual). Valores em centavos. */
export const SAAS_PLANS = [
  { id: "ate_20", label: "Até 20 alunos", maxStudents: 20, priceCents: 4900 },
  { id: "ate_50", label: "De 21 a 50 alunos", maxStudents: 50, priceCents: 7900 },
  { id: "ate_100", label: "De 51 a 100 alunos", maxStudents: 100, priceCents: 12900 },
] as const;

export const TRIAL_DAYS = 14;
