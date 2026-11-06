import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, hmac, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { isValidCnpj, isValidCpf, maskCpf, maskPhone, normalizeBrPhone } from "@/lib/br";
import { formatBRL, parseBRL } from "@/lib/money";
import { redact, redactString } from "@/lib/logger";
import { daysBetween, todaySP } from "@/lib/dates";

const KEY = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("criptografa e decriptografa", () => {
    const enc = encrypt("$aact_chave_super_secreta", KEY);
    expect(enc).not.toContain("chave");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(decrypt(enc, KEY)).toBe("$aact_chave_super_secreta");
  });

  it("gera IV diferente a cada chamada", () => {
    expect(encrypt("x", KEY)).not.toBe(encrypt("x", KEY));
  });

  it("falha com chave errada ou dado adulterado", () => {
    const enc = encrypt("segredo", KEY);
    expect(() => decrypt(enc, randomBytes(32).toString("base64"))).toThrow();
    const parts = enc.split(".");
    parts[3] = Buffer.from("outro").toString("base64url");
    expect(() => decrypt(parts.join("."), KEY)).toThrow();
  });

  it("rejeita chave mestra com tamanho errado", () => {
    expect(() => encrypt("x", Buffer.alloc(16).toString("base64"))).toThrow();
  });

  it("hmac é determinístico e depende da chave", () => {
    expect(hmac("12345678909", KEY)).toBe(hmac("12345678909", KEY));
    expect(hmac("12345678909", KEY)).not.toBe(hmac("12345678909", randomBytes(32).toString("base64")));
  });

  it("tokens são longos, únicos e o hash é estável", () => {
    const t = randomToken();
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(t).not.toBe(randomToken());
    expect(sha256(t)).toBe(sha256(t));
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("documentos e telefones", () => {
  it("valida CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("valida CNPJ", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
  });

  it("mascara CPF no formato ***.123.456-**", () => {
    expect(maskCpf("529.982.247-25")).toBe("***.982.247-**");
  });

  it("normaliza telefones brasileiros para wa.me", () => {
    expect(normalizeBrPhone("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizeBrPhone("+55 11 98765-4321")).toBe("5511987654321");
    expect(normalizeBrPhone("011 98765-4321")).toBe("5511987654321");
    expect(normalizeBrPhone("1133334444")).toBe("551133334444");
    expect(normalizeBrPhone("11 88765-4321")).toBeNull(); // celular sem 9
    expect(normalizeBrPhone("123")).toBeNull();
    expect(maskPhone("5511987654321")).toBe("(11) 9****-4321");
  });
});

describe("dinheiro em centavos", () => {
  it("formata BRL", () => {
    expect(formatBRL(12345).replace(/ /g, " ")).toBe("R$ 123,45");
    expect(() => formatBRL(1.5)).toThrow();
  });

  it("interpreta o que o motorista digita", () => {
    expect(parseBRL("150")).toBe(15000);
    expect(parseBRL("150,5")).toBe(15050);
    expect(parseBRL("R$ 1.250,50")).toBe(125050);
    expect(parseBRL("1250.50")).toBe(125050);
    expect(parseBRL("1.250")).toBe(125000);
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("")).toBeNull();
    expect(parseBRL("10,999")).toBeNull();
  });
});

describe("datas no fuso de São Paulo", () => {
  it("vira o dia em São Paulo, não em UTC", () => {
    // 02:30 UTC de 06/03 ainda é 05/03 em São Paulo (UTC-3).
    expect(todaySP(new Date("2026-03-06T02:30:00Z"))).toBe("2026-03-05");
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
  });
});

describe("logger nunca vaza dado sensível", () => {
  it("remove campos sensíveis pelo nome", () => {
    const out = redact({ apiKey: "x", cpf: "1", nested: { whatsapp: "5511", ok: "id-123" } }) as Record<string, unknown>;
    expect(out.apiKey).toBe("[removido]");
    expect(out.cpf).toBe("[removido]");
    expect((out.nested as Record<string, unknown>).whatsapp).toBe("[removido]");
    expect((out.nested as Record<string, unknown>).ok).toBe("id-123");
  });

  it("mascara padrões em texto livre", () => {
    const s = redactString(
      "erro para 529.982.247-25 tel (11) 98765-4321 mail a@b.com chave $aact_YTU5YTE0M2M2N2I4MTliNzk0YTI5N2U5MzdjNWZmNDQ6OjAwMDAwMDAwMDAwMDAwODk5NTQ6OiRhYWNoXzE",
    );
    expect(s).not.toMatch(/529\.982|98765|a@b\.com|aact_/);
  });
});
