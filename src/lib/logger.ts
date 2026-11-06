/**
 * Log interno com remoção de dados sensíveis.
 *
 * Regra do projeto: CPF, telefone, e-mail, chaves de API e tokens NUNCA vão
 * para o log. Este logger aplica duas camadas:
 *  1. Campos com nomes sensíveis são trocados por "[removido]".
 *  2. Strings são varridas por padrões (CPF, telefone, e-mail, chaves Asaas,
 *     JWT) e os trechos encontrados são mascarados.
 * Mesmo assim, prefira logar IDs internos em vez de dados de pessoas.
 */

const SENSITIVE_KEYS =
  /(cpf|cnpj|document|phone|whatsapp|telefone|email|password|senha|token|secret|api[_-]?key|access[_-]?token|authorization|cookie|payload|encodedimage)/i;

const PATTERNS: [RegExp, string][] = [
  [/\$?aact_[A-Za-z0-9_$:.-]+/g, "[chave-removida]"], // chaves do Asaas
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-removido]"],
  [/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, "[chave-removida]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email-removido]"],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf-removido]"],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[cnpj-removido]"],
  [/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, "[telefone-removido]"],
];

export function redactString(s: string): string {
  return PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[profundo]";
  if (typeof value === "string") return redactString(value);
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[removido]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const line = JSON.stringify({ level, msg: redactString(msg), ...(ctx ? (redact(ctx) as object) : {}), at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => process.env.APP_ENV !== "production" && write("debug", m, c),
  info: (m: string, c?: Record<string, unknown>) => write("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => write("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => write("error", m, c),
};
