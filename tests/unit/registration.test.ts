import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";
import {
  applySiblingDiscount,
  discountedAmount,
  parseDateBR,
  parseDiscount,
  parseMonthsPolicy,
  parseShift,
  validateRegistration,
} from "@/domain/registration";
import { buildImportReport, errorReportCsv, publicReport, templateCsv } from "@/domain/import";

const TODAY = "2026-03-05";
const valid = {
  studentName: "Ana  Souza",
  shift: "Manhã",
  guardianName: "Marcos Souza",
  cpf: "529.982.247-25",
  whatsapp: "(11) 98765-4321",
  monthlyAmount: "350,00",
  dueDay: "10",
};

describe("campos do cadastro", () => {
  it("turno aceita variações", () => {
    expect(parseShift("Manhã")).toBe("manha");
    expect(parseShift("vespertino")).toBe("tarde");
    expect(parseShift("INTEGRAL")).toBe("integral");
    expect(parseShift("madrugada")).toBeNull();
  });

  it("política de meses", () => {
    expect(parseMonthsPolicy("")).toEqual({ policy: "doze", customMonths: null });
    expect(parseMonthsPolicy("10")).toEqual({ policy: "dez", customMonths: null });
    expect(parseMonthsPolicy("fev-jun, ago-dez")).toEqual({ policy: "personalizada", customMonths: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] });
    expect(parseMonthsPolicy("3,4,5")).toEqual({ policy: "personalizada", customMonths: [3, 4, 5] });
    expect(parseMonthsPolicy("1-12")).toEqual({ policy: "doze", customMonths: null });
    expect(parseMonthsPolicy("13")).toBeNull();
    expect(parseMonthsPolicy("jun-fev")).toBeNull();
  });

  it("desconto: vazio, zero, percentual e valor", () => {
    expect(parseDiscount("")).toBeNull();
    expect(parseDiscount("0")).toEqual({ type: "nenhum", value: 0 });
    expect(parseDiscount("10%")).toEqual({ type: "percentual", value: 1000 });
    expect(parseDiscount("12,5%")).toEqual({ type: "percentual", value: 1250 });
    expect(parseDiscount("50,00")).toEqual({ type: "valor", value: 5000 });
    expect(parseDiscount("150%")).toBe("invalido");
    expect(parseDiscount("abc")).toBe("invalido");
  });

  it("valor com desconto em centavos, sem erro de arredondamento", () => {
    expect(discountedAmount(35000, { type: "percentual", value: 1000 })).toBe(31500);
    expect(discountedAmount(33333, { type: "percentual", value: 1000 })).toBe(30000); // 3333,3 -> 3333
    expect(discountedAmount(35000, { type: "valor", value: 5000 })).toBe(30000);
    expect(discountedAmount(35000, null)).toBe(35000);
    expect(discountedAmount(1000, { type: "valor", value: 5000 })).toBe(0);
  });

  it("datas brasileiras", () => {
    expect(parseDateBR("05/03/2026")).toBe("2026-03-05");
    expect(parseDateBR("5/3/26")).toBe("2026-03-05");
    expect(parseDateBR("2026-03-05")).toBe("2026-03-05");
    expect(parseDateBR("31/02/2026")).toBeNull();
    expect(parseDateBR("ontem")).toBeNull();
  });
});

describe("validação completa", () => {
  it("normaliza um cadastro válido", () => {
    const r = validateRegistration(valid, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      studentName: "Ana Souza",
      shift: "manha",
      cpf: "52998224725",
      whatsapp: "5511987654321",
      monthlyAmountCents: 35000,
      dueDay: 10,
      startDate: TODAY,
      monthsPolicy: "doze",
      discount: null,
      prorataFirstMonth: false,
    });
  });

  it("aponta cada campo com problema e diz o que fazer", () => {
    const r = validateRegistration({ ...valid, cpf: "111.111.111-11", whatsapp: "123", monthlyAmount: "abc", dueDay: "32", shift: "" }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["cpf", "dueDay", "monthlyAmount", "shift", "whatsapp"]);
    expect(r.errors.cpf).toMatch(/11 números/);
  });

  it("desconto não pode zerar a mensalidade", () => {
    const r = validateRegistration({ ...valid, discount: "100%" }, TODAY);
    expect(r.ok).toBe(false);
  });
});

describe("desconto de irmãos (D6)", () => {
  const tenant = { type: "percentual" as const, value: 1000 };
  it("1º aluno do pagador paga cheio; a partir do 2º, aplica o desconto", () => {
    expect(applySiblingDiscount(null, 0, tenant)).toEqual({ discount: { type: "nenhum", value: 0 }, auto: false });
    expect(applySiblingDiscount(null, 1, tenant)).toEqual({ discount: tenant, auto: true });
    expect(applySiblingDiscount(null, 2, tenant)).toEqual({ discount: tenant, auto: true });
  });
  it("desconto informado manualmente sempre vence", () => {
    expect(applySiblingDiscount({ type: "nenhum", value: 0 }, 3, tenant)).toEqual({ discount: { type: "nenhum", value: 0 }, auto: false });
    expect(applySiblingDiscount({ type: "valor", value: 2000 }, 1, tenant).discount).toEqual({ type: "valor", value: 2000 });
  });
  it("sem desconto configurado no tenant, nada muda", () => {
    expect(applySiblingDiscount(null, 1, { type: "nenhum", value: 0 }).auto).toBe(false);
  });
});

describe("CSV", () => {
  it("lê o separador ; do Excel brasileiro, BOM, aspas e quebra de linha", () => {
    const r = parseCsv('﻿aluno;obs\r\n"Silva; Ana";"linha 1\nlinha 2"\r\n;\r\nBeto;"diz ""oi"""\r\n');
    expect(r.headers).toEqual(["aluno", "obs"]);
    expect(r.rows).toEqual([
      { line: 2, cells: ["Silva; Ana", "linha 1\nlinha 2"] },
      { line: 5, cells: ["Beto", 'diz "oi"'] },
    ]);
  });
  it("lê separador vírgula", () => {
    expect(parseCsv("a,b\n1,2").rows[0].cells).toEqual(["1", "2"]);
  });
  it("gera CSV seguro contra fórmulas do Excel", () => {
    expect(toCsv([["=HYPERLINK(1)", "ok"]])).toContain("'=HYPERLINK(1)");
  });
});

describe("relatório de importação", () => {
  const ctx = (existing: [string, string][] = []) => {
    const studentsByPayer = new Map<string, Set<string>>();
    for (const [cpf, name] of existing) studentsByPayer.set(`h${cpf}`, new Set([name]));
    return { studentsByPayer, hashCpf: (c: string) => `h${c}` };
  };
  const header = "aluno;escola;serie;rota;turno;responsavel;cpf;whatsapp;email;valor;vencimento;inicio;meses;desconto;proporcional";

  it("o modelo para baixar é lido sem erro", () => {
    const r = buildImportReport(templateCsv(), TODAY, ctx());
    expect(r).toMatchObject({ ok: true, validCount: 1, errorCount: 0 });
  });

  it("valida linha a linha, com o número da linha da planilha", () => {
    const csv = [
      header,
      "Ana Souza;;;Rota A;manhã;Marcos Souza;529.982.247-25;11987654321;;350,00;10;;;;",
      "Beto;;;;tarde;Paula;123;11987654321;;350;10;;;;",
      "Ana Souza;;;Rota A;manhã;Marcos Souza;52998224725;11987654321;;350,00;10;;;;",
    ].join("\n");
    const r = buildImportReport(csv, TODAY, ctx());
    expect(r.validCount).toBe(1);
    expect(r.rows[1]).toMatchObject({ line: 3, valid: false });
    expect(r.rows[1].errors.join()).toMatch(/CPF do responsável/);
    expect(r.rows[2].errors.join()).toMatch(/igual à linha 2/);
    expect(errorReportCsv(r)).toContain("Beto");
  });

  it("avisa quando o mesmo CPF aparece com nomes diferentes de responsável", () => {
    const csv = [header, "Ana;;;;manhã;Marcos;52998224725;11987654321;;350;10;;;;", "Bia;;;;manhã;Sônia;52998224725;11987654321;;350;10;;;;"].join("\n");
    const r = buildImportReport(csv, TODAY, ctx());
    expect(r.validCount).toBe(2);
    expect(r.rows[1].warnings[0]).toMatch(/linha 2 com o nome “Marcos”/);
  });

  it("acusa aluno já cadastrado com o mesmo responsável", () => {
    const csv = [header, "Ana Souza;;;;manhã;Marcos;52998224725;11987654321;;350;10;;;;"].join("\n");
    const r = buildImportReport(csv, TODAY, ctx([["52998224725", "ana souza"]]));
    expect(r.rows[0].errors[0]).toMatch(/já está cadastrado/);
  });

  it("aceita cabeçalhos com nomes alternativos e acentos", () => {
    const csv = "Nome do Aluno;Período;Responsável;CPF;Celular;Mensalidade;Dia\nAna;Manhã;Marcos;52998224725;11987654321;350;5";
    expect(buildImportReport(csv, TODAY, ctx()).validCount).toBe(1);
  });

  it("erros que impedem a leitura", () => {
    expect(buildImportReport("", TODAY, ctx()).fatal).toMatch(/vazia/);
    expect(buildImportReport("aluno;turno\nAna;manha", TODAY, ctx()).fatal).toMatch(/Faltam colunas obrigatórias: responsavel, cpf/);
    expect(buildImportReport(header, TODAY, ctx()).fatal).toMatch(/só tem o cabeçalho/);
  });

  it("a versão para a tela não leva o CPF", () => {
    const csv = [header, "Ana;;;;manhã;Marcos;529.982.247-25;11987654321;;350;10;;;;"].join("\n");
    const pub = publicReport(buildImportReport(csv, TODAY, ctx()));
    expect(JSON.stringify(pub)).not.toContain("52998224725");
    expect(pub.rows[0].valid).toBe(true);
  });
});
