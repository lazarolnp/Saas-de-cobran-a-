/**
 * Criptografia de segredos na aplicação.
 *
 * - encrypt/decrypt: AES-256-GCM (confidencialidade + integridade). Formato
 *   armazenado: "v1.<iv>.<tag>.<ciphertext>" (base64url). O prefixo de versão
 *   permite trocar o algoritmo/chave no futuro sem perder dados antigos.
 * - hmac: hash determinístico com chave, para achar duplicidades (ex.: CPF)
 *   sem guardar o valor em claro. Usa uma subchave derivada (HKDF) para que
 *   a chave de criptografia nunca seja reutilizada em outro propósito.
 * - Funções puras: recebem a chave mestra como parâmetro (testável sem env).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

function subkey(masterKeyB64: string, purpose: "enc" | "hmac"): Buffer {
  const master = Buffer.from(masterKeyB64, "base64");
  if (master.length !== 32) throw new Error("Chave mestra deve ter 32 bytes");
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), `cobranca-escolar:${purpose}`, 32));
}

export function encrypt(plaintext: string, masterKeyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subkey(masterKeyB64, "enc"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string, masterKeyB64: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || ctB64 === undefined) {
    throw new Error("Formato de segredo criptografado inválido");
  }
  const decipher = createDecipheriv("aes-256-gcm", subkey(masterKeyB64, "enc"), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}

export function hmac(value: string, masterKeyB64: string): string {
  return createHmac("sha256", subkey(masterKeyB64, "hmac")).update(value).digest("base64url");
}

/** Token aleatório não adivinhável (padrão 32 bytes = 256 bits), seguro para URL. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Hash para guardar tokens (link de adesão, token de webhook) no banco. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/** Comparação em tempo constante, para validar tokens recebidos. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
