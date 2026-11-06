import { describe, expect, it } from "vitest";
import { addBusinessDays, businessDaysBetween, easter, holidays, isBusinessDay } from "@/domain/business-days";
import {
  canTransition,
  chargeAmount,
  chargeDescription,
  chooseMethod,
  competencesToGenerate,
  dueDateFor,
  effectiveDueDate,
  firstCompetence,
  generationDate,
  isBillableMonth,
  isOverdue,
  shouldFallBackToPixComum,
  type ContractTerms,
} from "@/domain/billing";
import { renderTemplate, unknownVariables, whatsappLink } from "@/domain/templates";

const terms = (over: Partial<ContractTerms> = {}): ContractTerms => ({
  startDate: "2026-02-01",
  endDate: null,
  dueDay: 10,
  monthsPolicy: "doze",
  customMonths: null,
  monthlyAmountCents: 40000,
  discount: { type: "nenhum", value: 0 },
  prorataFirstMonth: false,
  ...over,
});

describe("dias úteis bancários", () => {
  it("Páscoa e feriados móveis de 2026", () => {
    expect(easter(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    const h = holidays(2026);
    for (const d of ["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-11-20", "2026-12-25"]) expect(h.has(d)).toBe(true);
  });
  it("fins de semana e feriados não são úteis", () => {
    expect(isBusinessDay("2026-03-06")).toBe(true); // sexta
    expect(isBusinessDay("2026-03-07")).toBe(false); // sábado
    expect(isBusinessDay("2026-04-21")).toBe(false); // Tiradentes
  });
  it("soma e conta dias úteis", () => {
    expect(addBusinessDays("2026-03-06", 1)).toBe("2026-03-09"); // sexta -> segunda
    expect(addBusinessDays("2026-03-10", -8)).toBe("2026-02-26");
    expect(businessDaysBetween("2026-03-06", "2026-03-10")).toBe(2);
    expect(businessDaysBetween("2026-03-10", "2026-03-06")).toBe(-2);
  });
});

describe("política de meses e vencimento", () => {
  it("10 meses: sem janeiro e julho", () => {
    const t = terms({ monthsPolicy: "dez" });
    expect(isBillableMonth(t, "2026-01-01")).toBe(false);
    expect(isBillableMonth(t, "2026-07-01")).toBe(false);
    expect(isBillableMonth(t, "2026-08-01")).toBe(true);
  });
  it("personalizada só nos meses marcados", () => {
    const t = terms({ monthsPolicy: "personalizada", customMonths: [3, 4] });
    expect(isBillableMonth(t, "2026-03-01")).toBe(true);
    expect(isBillableMonth(t, "2026-05-01")).toBe(false);
  });
  it("dia 31 vira o último dia do mês", () => {
    expect(dueDateFor("2026-02-01", 31)).toBe("2026-02-28");
    expect(dueDateFor("2028-02-01", 31)).toBe("2028-02-29");
    expect(dueDateFor("2026-04-01", 5)).toBe("2026-04-05");
  });
  it("primeira competência pula mês sem cobrança", () => {
    expect(firstCompetence(terms({ startDate: "2026-07-15", monthsPolicy: "dez" }))).toBe("2026-08-01");
    expect(firstCompetence(terms({ startDate: "2026-07-15" }))).toBe("2026-07-01");
  });
});

describe("valor: desconto e proporcional (pro rata)", () => {
  it("desconto de irmão aplicado em todas as competências", () => {
    const t = terms({ discount: { type: "percentual", value: 1000 } });
    expect(chargeAmount(t, "2026-03-01")).toEqual({ amountCents: 36000, discountCents: 4000, prorated: false });
  });
  it("1º mês proporcional por dias corridos, arredondado para baixo", () => {
    // Começa em 16/03 (31 dias): usa 16 dias -> 40000 * 16 / 31 = 20645,16 -> 20645
    const t = terms({ startDate: "2026-03-16", prorataFirstMonth: true });
    expect(chargeAmount(t, "2026-03-01")).toEqual({ amountCents: 20645, discountCents: 0, prorated: true });
    expect(chargeAmount(t, "2026-04-01").prorated).toBe(false);
  });
  it("proporcional sobre o valor já com desconto", () => {
    const t = terms({ startDate: "2026-04-16", prorataFirstMonth: true, discount: { type: "valor", value: 4000 } });
    expect(chargeAmount(t, "2026-04-01").amountCents).toBe(Math.floor((36000 * 15) / 30));
  });
  it("sem proporcional quando começa no dia 1 ou o mês de início não é cobrado", () => {
    expect(chargeAmount(terms({ startDate: "2026-03-01", prorataFirstMonth: true }), "2026-03-01").prorated).toBe(false);
    const jul = terms({ startDate: "2026-07-20", prorataFirstMonth: true, monthsPolicy: "dez" });
    expect(chargeAmount(jul, "2026-08-01").prorated).toBe(false);
  });
});

describe("geração por competência", () => {
  it("gera 8 dias úteis antes do vencimento", () => {
    expect(generationDate("2026-03-01", 10)).toBe("2026-02-26");
    expect(competencesToGenerate(terms(), "2026-02-25", new Set(["2026-02-01"]))).toEqual([]);
    expect(competencesToGenerate(terms(), "2026-02-26", new Set(["2026-02-01"]))).toEqual(["2026-03-01"]);
  });
  it("não repete competência já gerada (idempotente)", () => {
    const existing = new Set(["2026-02-01", "2026-03-01"]);
    expect(competencesToGenerate(terms(), "2026-03-01", existing)).toEqual([]);
  });
  it("nunca gera mês sem cobrança nem fora da vigência", () => {
    const t = terms({ startDate: "2026-06-01", endDate: "2026-09-30", monthsPolicy: "dez" });
    const all = competencesToGenerate(t, "2026-12-31", new Set());
    expect(all).toEqual(["2026-06-01", "2026-08-01", "2026-09-01"].slice(-3));
    expect(all).not.toContain("2026-07-01");
    expect(all).not.toContain("2026-10-01");
  });
  it("contrato antigo cadastrado agora: no máximo 3 meses para trás", () => {
    expect(competencesToGenerate(terms({ startDate: "2025-01-01" }), "2026-03-01", new Set())).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
  it("vencimento que já passou vence hoje", () => {
    expect(effectiveDueDate("2026-03-05", "2026-03-09")).toBe("2026-03-09");
    expect(effectiveDueDate("2026-03-20", "2026-03-09")).toBe("2026-03-20");
  });
});

describe("cobrança híbrida", () => {
  it("Pix Automático só com autorização ativa e 2 dias úteis de antecedência", () => {
    expect(chooseMethod({ authorizationActive: true, dueDate: "2026-03-10", today: "2026-02-26" })).toBe("pix_automatico");
    expect(chooseMethod({ authorizationActive: true, dueDate: "2026-03-10", today: "2026-03-09" })).toBe("pix_comum");
    expect(chooseMethod({ authorizationActive: false, dueDate: "2026-03-10", today: "2026-02-26" })).toBe("pix_comum");
  });
  it("D8: aguardando adesão vira Pix comum quando o link expira ou após 7 dias sem link", () => {
    const base = { billingMode: "aguardando_adesao" as const, contractCreatedAt: "2026-03-01T12:00:00Z", graceDays: 7 };
    expect(shouldFallBackToPixComum({ ...base, liveLinkExpiresAt: "2026-03-08T12:00:00Z", now: "2026-03-08T11:00:00Z" })).toBe(false);
    expect(shouldFallBackToPixComum({ ...base, liveLinkExpiresAt: "2026-03-08T12:00:00Z", now: "2026-03-08T12:00:01Z" })).toBe(true);
    expect(shouldFallBackToPixComum({ ...base, liveLinkExpiresAt: null, now: "2026-03-07T00:00:00Z" })).toBe(false);
    expect(shouldFallBackToPixComum({ ...base, liveLinkExpiresAt: null, now: "2026-03-08T12:00:00Z" })).toBe(true);
    expect(shouldFallBackToPixComum({ ...base, billingMode: "pix_automatico", liveLinkExpiresAt: null, now: "2027-01-01T00:00:00Z" })).toBe(false);
  });
});

describe("status da cobrança", () => {
  it("só avança; paga e cancelada são finais", () => {
    expect(canTransition("enviada", "paga")).toBe(true);
    expect(canTransition("atrasada", "paga")).toBe(true);
    expect(canTransition("paga", "atrasada")).toBe(false);
    expect(canTransition("paga", "enviada")).toBe(false);
    expect(canTransition("cancelada", "paga")).toBe(false);
    expect(canTransition("paga", "paga")).toBe(true);
  });
  it("atrasa no dia seguinte ao vencimento", () => {
    expect(isOverdue("enviada", "2026-03-10", "2026-03-10")).toBe(false);
    expect(isOverdue("enviada", "2026-03-10", "2026-03-11")).toBe(true);
    expect(isOverdue("paga", "2026-03-10", "2026-03-11")).toBe(false);
  });
  it("descrição curta para o app do banco", () => {
    expect(chargeDescription("Ana", "2026-03-01")).toBe("Transporte escolar Ana 03/2026");
  });
});

describe("modelos de mensagem", () => {
  const data = { responsavel: "Marcos Souza", aluno: "Ana Souza", valorCents: 35000, vencimento: "2026-03-10", link: "https://x/p/abc" };
  it("preenche as variáveis", () => {
    expect(renderTemplate("Olá, {responsavel}! {aluno}: {valor} até {vencimento}. {link}", data)).toBe("Olá, Marcos! Ana: R$ 350,00 até 10/03/2026. https://x/p/abc");
  });
  it("mantém variável desconhecida e avisa", () => {
    expect(renderTemplate("{nome}", data)).toBe("{nome}");
    expect(unknownVariables("{responsavel} {nome}")).toEqual(["nome"]);
  });
  it("monta o link do WhatsApp", () => {
    expect(whatsappLink("5511987654321", "Olá & tchau")).toBe("https://wa.me/5511987654321?text=Ol%C3%A1%20%26%20tchau");
  });
});
