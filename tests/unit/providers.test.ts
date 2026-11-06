import { beforeEach, describe, expect, it, vi } from "vitest";
import { AsaasProvider, mapAuthorizationStatus, mapPaymentStatus, parseAsaasWebhook } from "@/providers/asaas/asaas-provider";
import { MockProvider, mockSimulator, resetMockProvider } from "@/providers/mock/mock-provider";
import { availableProviders, createProvider, providerEnvironmentFor, ProviderError, type PaymentProvider } from "@/providers";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: { status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift() ?? { status: 500 };
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const body = (c: Call) => JSON.parse(String(c.init.body));
const header = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name];

describe("AsaasProvider: requisições conforme a documentação", () => {
  it("usa a URL do sandbox, o header access_token e o User-Agent", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { general: "APPROVED" } }]);
    const p = new AsaasProvider("$aact_teste", "sandbox", fn);
    const r = await p.testConnection();
    expect(r).toMatchObject({ ok: true, accountApproved: true });
    expect(calls[0].url).toBe("https://api-sandbox.asaas.com/v3/myAccount/status/");
    expect(header(calls[0], "access_token")).toBe("$aact_teste");
    expect(header(calls[0], "User-Agent")).toBeTruthy();
  });

  it("produção usa api.asaas.com", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { general: "PENDING" } }]);
    const r = await new AsaasProvider("k_producao", "producao", fn).testConnection();
    expect(calls[0].url).toBe("https://api.asaas.com/v3/myAccount/status/");
    expect(r.accountApproved).toBe(false);
    expect(r.message).toMatch(/ainda não foi aprovado/);
  });

  it("chave inválida vira mensagem simples, sem detalhe técnico", async () => {
    const { fn } = fakeFetch([{ status: 401, body: { errors: [{ code: "invalid_access_token", description: "A chave de API fornecida é inválida" }] } }]);
    const r = await new AsaasProvider("errada", "sandbox", fn).testConnection();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/chave de acesso não foi aceita/);
  });

  it("chave do ambiente errado explica a diferença entre teste e produção", async () => {
    const { fn } = fakeFetch([{ status: 401, body: { errors: [{ code: "invalid_environment", description: "A chave de API informada não pertence a este ambiente" }] } }]);
    const r = await new AsaasProvider("chave_prod", "sandbox", fn).testConnection();
    expect(r.message).toMatch(/produção/);
  });

  it("cria cliente sem notificações do Asaas (a régua é nossa)", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { id: "cus_1" } }]);
    const r = await new AsaasProvider("k", "sandbox", fn).createCustomer({ name: "Ana", cpfCnpj: "52998224725", mobilePhone: "5511987654321", externalReference: "g1" });
    expect(r.id).toBe("cus_1");
    expect(calls[0].url).toMatch(/\/v3\/customers$/);
    expect(body(calls[0])).toMatchObject({ name: "Ana", cpfCnpj: "52998224725", mobilePhone: "11987654321", externalReference: "g1", notificationDisabled: true });
  });

  it("cobrança Pix comum vs. Pix Automático: só muda pixAutomaticAuthorizationId; centavos viram reais", async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { id: "pay_1", status: "PENDING", value: 405.5, dueDate: "2026-03-10", invoiceUrl: "https://x" } },
      { status: 200, body: { id: "pay_2", status: "PENDING", value: 405.5, dueDate: "2026-04-10" } },
    ]);
    const p = new AsaasProvider("k", "sandbox", fn);
    const comum = await p.createPixCharge({ customerId: "cus_1", amountCents: 40550, dueDate: "2026-03-10", description: "Transporte", externalReference: "c1" });
    expect(body(calls[0])).toEqual({ customer: "cus_1", billingType: "PIX", value: 405.5, dueDate: "2026-03-10", description: "Transporte", externalReference: "c1" });
    expect(comum).toMatchObject({ id: "pay_1", amountCents: 40550, status: "pendente", paymentLink: "https://x" });

    await p.createPixCharge({ customerId: "cus_1", amountCents: 40550, dueDate: "2026-04-10", description: "Transporte", externalReference: "c2", authorizationId: "auth_1" });
    expect(body(calls[1]).pixAutomaticAuthorizationId).toBe("auth_1");
  });

  it("autorização: Jornada 3 com immediateQrCode, modo MANUAL, piso mínimo e retentativa", async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { id: "auth_1", status: "CREATED", payload: "000201...", encodedImage: "iVBOR", immediateQrCode: { expirationDate: "2026-03-08 10:00:00" } } },
    ]);
    const a = await new AsaasProvider("k", "sandbox", fn).createAuthorization({
      customerId: "cus_1",
      contractRef: "a".repeat(32),
      startDate: "2026-03-01",
      minLimitCents: 40000,
      firstCharge: { amountCents: 25000, description: "1º mês", expirationSeconds: 604800 },
      description: "Transporte escolar Ana",
      allowRetries: true,
    });
    expect(calls[0].url).toMatch(/\/v3\/pix\/automatic\/authorizations$/);
    expect(body(calls[0])).toEqual({
      frequency: "MONTHLY",
      contractId: "a".repeat(32),
      startDate: "2026-03-01",
      description: "Transporte escolar Ana",
      customerId: "cus_1",
      minLimitValue: 400,
      paymentCreationMode: "MANUAL",
      retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS",
      immediateQrCode: { expirationSeconds: 604800, originalValue: 250, description: "1º mês" },
    });
    expect(body(calls[0])).not.toHaveProperty("value"); // D3: sem valor fixo
    expect(a).toMatchObject({ id: "auth_1", status: "pendente", qrPayload: "000201...", qrImageBase64: "iVBOR" });
  });

  it("contractId acima de 35 caracteres é barrado antes de chamar o provedor", async () => {
    const { fn, calls } = fakeFetch([]);
    await expect(
      new AsaasProvider("k", "sandbox", fn).createAuthorization({
        customerId: "c", contractRef: "x".repeat(36), startDate: "2026-03-01", minLimitCents: 1,
        firstCharge: { amountCents: 1, description: "", expirationSeconds: 60 }, description: "", allowRetries: false,
      }),
    ).rejects.toThrow(/35/);
    expect(calls).toHaveLength(0);
  });

  it("consulta, cancela autorização e exclui cobrança com os verbos documentados", async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { id: "a1", status: "ACTIVE" } },
      { status: 200, body: { id: "a1", status: "CANCELLED", cancellationReason: "REQUESTED_BY_RECEIVER" } },
      { status: 200, body: { deleted: true, id: "pay_1" } },
      { status: 200, body: { payload: "copia", encodedImage: "img", expirationDate: "2027-01-01 00:00:00" } },
    ]);
    const p = new AsaasProvider("k", "sandbox", fn);
    expect((await p.getAuthorization("a1")).status).toBe("ativa");
    expect(await p.cancelAuthorization("a1")).toMatchObject({ status: "cancelada", cancellationReason: "REQUESTED_BY_RECEIVER" });
    await p.cancelCharge("pay_1");
    expect(await p.getPixQrCode("pay_1")).toEqual({ payload: "copia", imageBase64: "img", expiresAt: "2027-01-01 00:00:00" });
    expect(calls.map((c) => `${c.init.method} ${c.url.replace("https://api-sandbox.asaas.com", "")}`)).toEqual([
      "GET /v3/pix/automatic/authorizations/a1",
      "DELETE /v3/pix/automatic/authorizations/a1",
      "DELETE /v3/payments/pay_1",
      "GET /v3/payments/pay_1/pixQrCode",
    ]);
  });

  it("webhook é cadastrado com nosso token, envio não sequencial e eventos de Pix Automático", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { id: "wh_1" } }]);
    await new AsaasProvider("k", "sandbox", fn).registerWebhook({ url: "https://app.exemplo.com.br/api/webhooks/asaas/abc", authToken: "tok", notificationEmail: "m@x.com" });
    const b = body(calls[0]);
    expect(b).toMatchObject({ url: "https://app.exemplo.com.br/api/webhooks/asaas/abc", authToken: "tok", enabled: true, interrupted: false, sendType: "NON_SEQUENTIALLY" });
    expect(b.events).toContain("PAYMENT_RECEIVED");
    expect(b.events).toContain("PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED");
  });

  it("repete GET uma vez quando o provedor está fora; POST nunca é repetido", async () => {
    const get = fakeFetch([{ status: 503 }, { status: 200, body: { id: "a1", status: "ACTIVE" } }]);
    expect((await new AsaasProvider("k", "sandbox", get.fn).getAuthorization("a1")).status).toBe("ativa");
    expect(get.calls).toHaveLength(2);

    const post = fakeFetch([{ status: 503 }, { status: 200, body: { id: "x" } }]);
    const err = await new AsaasProvider("k", "sandbox", post.fn)
      .createCustomer({ name: "A", cpfCnpj: "52998224725", externalReference: "g" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe("indisponivel");
    expect(post.calls).toHaveLength(1);
  });

  it("erro de validação usa a descrição em português do Asaas para o usuário", async () => {
    const { fn } = fakeFetch([{ status: 400, body: { errors: [{ code: "invalid_cpfCnpj", description: "O CPF/CNPJ informado é inválido." }] } }]);
    const err = await new AsaasProvider("k", "sandbox", fn).createCustomer({ name: "A", cpfCnpj: "1", externalReference: "g" }).catch((e) => e);
    expect(err.userMessage).toBe("O CPF/CNPJ informado é inválido.");
    expect(err.technical).toMatchObject({ status: 400, codes: ["invalid_cpfCnpj"], operation: "createCustomer" });
  });
});

describe("tradução de status e webhooks (exemplos da documentação)", () => {
  it("mapeia status de cobrança e autorização", () => {
    expect(mapPaymentStatus("RECEIVED")).toBe("paga");
    expect(mapPaymentStatus("CONFIRMED")).toBe("paga");
    expect(mapPaymentStatus("OVERDUE")).toBe("vencida");
    expect(mapPaymentStatus("PENDING", true)).toBe("cancelada");
    expect(mapAuthorizationStatus("CREATED")).toBe("pendente");
    expect(mapAuthorizationStatus("ACTIVE")).toBe("ativa");
    expect(mapAuthorizationStatus("REFUSED")).toBe("recusada");
  });

  it("PAYMENT_RECEIVED", () => {
    const e = parseAsaasWebhook({
      id: "evt_05b708f961d739ea7eba7e4db318f621&368604920",
      event: "PAYMENT_RECEIVED",
      payment: { object: "payment", id: "pay_080225913252", value: 100, status: "RECEIVED", paymentDate: "2021-01-01", clientPaymentDate: "2021-01-01", externalReference: "056984" },
    });
    expect(e).toEqual({
      kind: "charge", eventId: "evt_05b708f961d739ea7eba7e4db318f621&368604920", type: "PAYMENT_RECEIVED",
      providerChargeId: "pay_080225913252", status: "paga", amountCents: 10000, paidAt: "2021-01-01", externalReference: "056984",
    });
  });

  it("PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED", () => {
    const e = parseAsaasWebhook({
      id: "evt_123456",
      event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
      authorization: { id: "d51008fa-e28e-4823-82b4-4b1fcf485229", status: "ACTIVE", customerId: "cus_000006869125", frequency: "MONTHLY", value: 2.0 },
    });
    expect(e).toMatchObject({ kind: "authorization", providerAuthorizationId: "d51008fa-e28e-4823-82b4-4b1fcf485229", status: "ativa" });
  });

  it("PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED", () => {
    const e = parseAsaasWebhook({
      id: "evt_9",
      event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED",
      paymentInstruction: { id: "f655", status: "SCHEDULED", dueDate: "2024-10-04", paymentId: "pay_080225913252", authorization: { id: "c6b1" } },
    });
    expect(e).toEqual({ kind: "instruction", eventId: "evt_9", type: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED", providerChargeId: "pay_080225913252", providerAuthorizationId: "c6b1", outcome: "agendada" });
  });

  it("elegibilidade, eventos desconhecidos e corpo inválido", () => {
    expect(parseAsaasWebhook({ id: "e1", event: "PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED", eligibility: { status: "INELIGIBLE", ineligibleReasons: [] } })).toMatchObject({ kind: "eligibility", eligible: false });
    expect(parseAsaasWebhook({ id: "e2", event: "TRANSFER_DONE" })).toEqual({ kind: "ignored", eventId: "e2", type: "TRANSFER_DONE" });
    expect(() => parseAsaasWebhook({ event: "PAYMENT_RECEIVED" })).toThrow(ProviderError);
    expect(() => parseAsaasWebhook("lixo")).toThrow(ProviderError);
  });
});

describe("fábrica de provedores", () => {
  it("nunca usa produção fora de produção e não oferece o simulado em produção", () => {
    expect(providerEnvironmentFor("development")).toBe("sandbox");
    expect(providerEnvironmentFor("staging")).toBe("sandbox");
    expect(providerEnvironmentFor("production")).toBe("producao");
    expect(availableProviders("production")).toEqual(["asaas"]);
    expect(() => createProvider("mock", "mock_x", "production")).toThrow();
    expect(createProvider("asaas", "k", "development").environment).toBe("sandbox");
  });
});

describe("MockProvider segue o mesmo contrato e as sequências documentadas", () => {
  let p: PaymentProvider;
  beforeEach(() => {
    resetMockProvider();
    p = new MockProvider("mock_teste");
  });

  it("recusa chave que não começa com mock_", async () => {
    expect((await new MockProvider("abc").testConnection()).ok).toBe(false);
    expect((await p.testConnection()).ok).toBe(true);
  });

  it("não deixa vincular cobrança a autorização que não está ativa", async () => {
    const { id: customerId } = await p.createCustomer({ name: "Ana", cpfCnpj: "52998224725", externalReference: "g" });
    const auth = await p.createAuthorization({ customerId, contractRef: "c1", startDate: "2026-03-01", minLimitCents: 40000, firstCharge: { amountCents: 40000, description: "1º", expirationSeconds: 60 }, description: "x", allowRetries: true });
    await expect(p.createPixCharge({ customerId, amountCents: 40000, dueDate: "2026-04-10", description: "x", externalReference: "c", authorizationId: auth.id })).rejects.toThrow(ProviderError);

    const events = mockSimulator.enroll(auth.id, "ativada").map((b) => p.parseWebhook(b));
    expect(events.map((e) => e.type)).toEqual([
      "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED", "PAYMENT_CREATED", "PAYMENT_RECEIVED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
    ]);
    const charge = await p.createPixCharge({ customerId, amountCents: 40000, dueDate: "2026-04-10", description: "x", externalReference: "c", authorizationId: auth.id });
    const debit = mockSimulator.debitInstruction(charge.id, "pago").map((b) => p.parseWebhook(b));
    expect(debit.at(-1)).toMatchObject({ kind: "charge", status: "paga", amountCents: 40000 });
  });

  it("pagamento recebido mas autorização recusada (pegadinha da Jornada 3)", async () => {
    const { id: customerId } = await p.createCustomer({ name: "Ana", cpfCnpj: "52998224725", externalReference: "g" });
    const auth = await p.createAuthorization({ customerId, contractRef: "c1", startDate: "2026-03-01", minLimitCents: 1, firstCharge: { amountCents: 100, description: "", expirationSeconds: 60 }, description: "", allowRetries: false });
    const types = mockSimulator.enroll(auth.id, "recusada_apos_pagamento").map((b) => p.parseWebhook(b).type);
    expect(types.slice(-2)).toEqual(["PAYMENT_RECEIVED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED"]);
    expect((await p.getAuthorization(auth.id)).status).toBe("recusada");
  });

  it("Pix comum: pagamento com valor diferente chega com o valor real pago", async () => {
    const { id: customerId } = await p.createCustomer({ name: "Ana", cpfCnpj: "52998224725", externalReference: "g" });
    const c = await p.createPixCharge({ customerId, amountCents: 40000, dueDate: "2026-04-10", description: "x", externalReference: "c" });
    const [e] = mockSimulator.payCharge(c.id, { amountCents: 35000 }).map((b) => p.parseWebhook(b));
    expect(e).toMatchObject({ kind: "charge", status: "paga", amountCents: 35000, externalReference: "c" });
  });
});
