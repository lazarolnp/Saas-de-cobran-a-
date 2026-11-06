/**
 * Mensagens com variáveis {responsavel}, {aluno}, {valor}, {vencimento}, {link}.
 */
import { formatBRL } from "@/lib/money";

export const TEMPLATE_VARIABLES = ["responsavel", "aluno", "valor", "vencimento", "link"] as const;

export interface TemplateData {
  responsavel: string;
  aluno: string;
  valorCents: number;
  vencimento: string; // AAAA-MM-DD
  link: string;
}

const firstName = (s: string) => s.trim().split(/\s+/)[0] ?? s;

export function renderTemplate(body: string, d: TemplateData): string {
  const [y, m, day] = d.vencimento.split("-");
  const values: Record<string, string> = {
    responsavel: firstName(d.responsavel),
    aluno: firstName(d.aluno),
    valor: formatBRL(d.valorCents).replace(/ /g, " "),
    vencimento: `${day}/${m}/${y}`,
    link: d.link,
  };
  return body.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);
}

/** Variáveis desconhecidas no texto (para avisar ao editar o modelo). */
export function unknownVariables(body: string): string[] {
  return [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !(TEMPLATE_VARIABLES as readonly string[]).includes(k));
}

/** Link do WhatsApp com o texto preenchido. */
export function whatsappLink(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
