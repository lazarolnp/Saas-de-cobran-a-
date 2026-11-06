/**
 * Dinheiro sempre em CENTAVOS inteiros. Nunca use float para somar valores.
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 12345 -> "R$ 123,45" (com espaço não separável, como o Intl gera). */
export function formatBRL(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("Valor deve estar em centavos inteiros");
  return brl.format(cents / 100);
}

/**
 * Converte texto digitado pelo usuário em centavos.
 * Aceita "150", "150,00", "R$ 1.250,50", "1250.50". Retorna null se inválido.
 */
export function parseBRL(input: string): number | null {
  let s = input.replace(/R\$|\s| /g, "").trim();
  if (!s || /[^0-9.,]/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1) {
    // Formato brasileiro: ponto é milhar, vírgula é decimal.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1 && s.length - lastDot - 1 !== 2) {
    // "1.250" -> milhar; "1250.50" -> decimal.
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}

/** Centavos -> número em reais, só para enviar a APIs externas que pedem decimal. */
export function centsToDecimal(cents: number): number {
  return Math.round(cents) / 100;
}
