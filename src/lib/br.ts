/**
 * Utilitários de documentos e telefones brasileiros: validação, normalização
 * e máscaras para exibição (LGPD: mostrar só o necessário).
 */

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCnpj(input: string): boolean {
  const cnpj = onlyDigits(input);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(cnpj[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/** "***.123.456-**": esconde o começo e o dígito verificador. */
export function maskCpf(input: string): string {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11) return "***.***.***-**";
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

/**
 * Normaliza celular/fixo brasileiro para "55DDXXXXXXXXX" (formato do wa.me).
 * Aceita "(11) 98765-4321", "+55 11 98765-4321", "11987654321" etc.
 * Retorna null se não parecer um telefone brasileiro válido.
 */
export function normalizeBrPhone(input: string): string | null {
  let d = onlyDigits(input);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null; // celular tem 9 na frente
  return `55${d}`;
}

/** "(11) 9****-4321" */
export function maskPhone(e164: string): string {
  const d = onlyDigits(e164).replace(/^55/, "");
  if (d.length < 10) return "(**) ****-****";
  const ddd = d.slice(0, 2);
  const last = d.slice(-4);
  return d.length === 11 ? `(${ddd}) 9****-${last}` : `(${ddd}) ****-${last}`;
}
