/**
 * Provedor SIMULADO para desenvolvimento e testes. Nunca é usado em produção
 * (a fábrica bloqueia com APP_ENV=production).
 *
 * - Guarda o estado em memória do processo (globalThis), o que basta para o
 *   servidor de desenvolvimento e para os testes.
 * - Chaves válidas começam com "mock_". "mock_recusar" simula chave inválida.
 * - Os eventos de webhook simulados têm o MESMO formato documentado pelo Asaas,
 *   para exercitar o mesmo caminho de código (parseAsaasWebhook). As sequências
 *   seguem docs.asaas.com/docs/fluxos-de-webhook.
 */
import { randomUUID } from "node:crypto";
import { centsToDecimal } from "@/lib/money";
import { parseAsaasWebhook } from "../asaas/asaas-provider";
import {
  DEFAULT_USER_MESSAGES,
  ProviderError,
  type ConnectionCheck,
  type CreateAuthorizationInput,
  type CreateCustomerInput,
  type CreatePixChargeInput,
  type PaymentProvider,
  type PixQrCode,
  type ProviderAuthorization,
  type ProviderCharge,
  type RegisterWebhookInput,
  type WebhookEvent,
} from "../payment-provider";

type MockCharge = ProviderCharge & { customerId: string; externalReference: string; authorizationId: string | null; deleted: boolean };
type MockAuthorization = ProviderAuthorization & { customerId: string; contractRef: string; minLimitCents: number; firstChargeCents: number };

interface MockState {
  customers: Map<string, CreateCustomerInput>;
  charges: Map<string, MockCharge>;
  authorizations: Map<string, MockAuthorization>;
  webhooks: Map<string, RegisterWebhookInput>;
}

const g = globalThis as unknown as { __mockProviderState?: MockState };
function state(): MockState {
  g.__mockProviderState ??= { customers: new Map(), charges: new Map(), authorizations: new Map(), webhooks: new Map() };
  return g.__mockProviderState;
}

/** Limpa o estado (para testes). */
export function resetMockProvider() {
  g.__mockProviderState = undefined;
}

/** "Copia e cola" claramente falso: não é um BR Code válido e nenhum banco aceita. */
const fakePixPayload = (ref: string, cents: number) => `PIX-SIMULADO|${ref}|${cents}`;

export const MOCK_WEBHOOK_HEADER = "x-mock-webhook-token";

export class MockProvider implements PaymentProvider {
  readonly kind = "mock" as const;
  readonly environment = "sandbox" as const;

  constructor(private readonly apiKey: string) {}

  private ensureKey(operation: string) {
    if (!this.apiKey.startsWith("mock_") || this.apiKey === "mock_recusar") {
      throw new ProviderError("autenticacao", DEFAULT_USER_MESSAGES.autenticacao, { operation, status: 401 });
    }
  }

  async testConnection(): Promise<ConnectionCheck> {
    try {
      this.ensureKey("testConnection");
    } catch (err) {
      return { ok: false, accountApproved: null, message: (err as ProviderError).userMessage };
    }
    return { ok: true, accountApproved: true, message: "Conexão feita! (provedor simulado, sem dinheiro de verdade)" };
  }

  async createCustomer(input: CreateCustomerInput) {
    this.ensureKey("createCustomer");
    if (!/^\d{11}$|^\d{14}$/.test(input.cpfCnpj)) {
      throw new ProviderError("validacao", "O CPF ou CNPJ informado é inválido.", { operation: "createCustomer", status: 400 });
    }
    const id = `cus_mock_${randomUUID().slice(0, 12)}`;
    state().customers.set(id, input);
    return { id };
  }

  async createPixCharge(input: CreatePixChargeInput): Promise<ProviderCharge> {
    this.ensureKey("createPixCharge");
    if (!state().customers.has(input.customerId)) {
      throw new ProviderError("nao_encontrado", DEFAULT_USER_MESSAGES.nao_encontrado, { operation: "createPixCharge", status: 404 });
    }
    if (input.authorizationId) {
      const auth = state().authorizations.get(input.authorizationId);
      // Regra documentada: só vincular cobranças a autorizações ACTIVE.
      if (!auth || auth.status !== "ativa") {
        throw new ProviderError("validacao", "A autorização do Pix Automático não está ativa.", { operation: "createPixCharge", status: 400 });
      }
    }
    const id = `pay_mock_${randomUUID().slice(0, 12)}`;
    const charge: MockCharge = {
      id,
      status: "pendente",
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      paymentLink: `https://mock.invalid/fatura/${id}`,
      customerId: input.customerId,
      externalReference: input.externalReference,
      authorizationId: input.authorizationId ?? null,
      deleted: false,
    };
    state().charges.set(id, charge);
    return publicCharge(charge);
  }

  async getPixQrCode(id: string): Promise<PixQrCode> {
    this.ensureKey("getPixQrCode");
    const c = state().charges.get(id);
    if (!c) throw new ProviderError("nao_encontrado", DEFAULT_USER_MESSAGES.nao_encontrado, { operation: "getPixQrCode", status: 404 });
    return { payload: fakePixPayload(id, c.amountCents), imageBase64: null, expiresAt: null };
  }

  async cancelCharge(id: string) {
    this.ensureKey("cancelCharge");
    const c = state().charges.get(id);
    if (!c) throw new ProviderError("nao_encontrado", DEFAULT_USER_MESSAGES.nao_encontrado, { operation: "cancelCharge", status: 404 });
    c.deleted = true;
    c.status = "cancelada";
  }

  async createAuthorization(input: CreateAuthorizationInput): Promise<ProviderAuthorization> {
    this.ensureKey("createAuthorization");
    if (input.contractRef.length > 35) throw new Error("contractRef deve ter no máximo 35 caracteres");
    const id = randomUUID();
    const auth: MockAuthorization = {
      id,
      status: "pendente",
      qrPayload: fakePixPayload(`auth-${id.slice(0, 8)}`, input.firstCharge.amountCents),
      qrImageBase64: null,
      qrExpiresAt: new Date(Date.now() + input.firstCharge.expirationSeconds * 1000).toISOString(),
      cancellationReason: null,
      customerId: input.customerId,
      contractRef: input.contractRef,
      minLimitCents: input.minLimitCents,
      firstChargeCents: input.firstCharge.amountCents,
    };
    state().authorizations.set(id, auth);
    return publicAuthorization(auth);
  }

  async getAuthorization(id: string): Promise<ProviderAuthorization> {
    this.ensureKey("getAuthorization");
    const a = state().authorizations.get(id);
    if (!a) throw new ProviderError("nao_encontrado", DEFAULT_USER_MESSAGES.nao_encontrado, { operation: "getAuthorization", status: 404 });
    return publicAuthorization(a);
  }

  async cancelAuthorization(id: string): Promise<ProviderAuthorization> {
    this.ensureKey("cancelAuthorization");
    const a = state().authorizations.get(id);
    if (!a) throw new ProviderError("nao_encontrado", DEFAULT_USER_MESSAGES.nao_encontrado, { operation: "cancelAuthorization", status: 404 });
    a.status = "cancelada";
    a.cancellationReason = "REQUESTED_BY_RECEIVER";
    return publicAuthorization(a);
  }

  async registerWebhook(input: RegisterWebhookInput) {
    this.ensureKey("registerWebhook");
    const id = `wh_mock_${randomUUID().slice(0, 8)}`;
    state().webhooks.set(id, input);
    return { id };
  }

  webhookToken(headers: Headers): string | null {
    return headers.get(MOCK_WEBHOOK_HEADER);
  }

  parseWebhook(body: unknown): WebhookEvent {
    return parseAsaasWebhook(body);
  }
}

function publicCharge(c: MockCharge): ProviderCharge {
  return { id: c.id, status: c.status, amountCents: c.amountCents, dueDate: c.dueDate, paymentLink: c.paymentLink };
}

function publicAuthorization(a: MockAuthorization): ProviderAuthorization {
  const live = a.status === "pendente";
  return {
    id: a.id,
    status: a.status,
    qrPayload: live ? a.qrPayload : null,
    qrImageBase64: null,
    qrExpiresAt: live ? a.qrExpiresAt : null,
    cancellationReason: a.cancellationReason,
  };
}

// --- Simulador de eventos (formato do Asaas) -----------------------------------

const evt = () => `evt_mock_${randomUUID().replace(/-/g, "")}`;

function paymentEvent(event: string, c: MockCharge, paidDate?: string) {
  return {
    id: evt(),
    event,
    payment: {
      object: "payment",
      id: c.id,
      customer: c.customerId,
      value: centsToDecimal(c.amountCents),
      billingType: "PIX",
      status: event === "PAYMENT_OVERDUE" ? "OVERDUE" : paidDate ? "RECEIVED" : "PENDING",
      dueDate: c.dueDate,
      paymentDate: paidDate ?? null,
      clientPaymentDate: paidDate ?? null,
      externalReference: c.externalReference,
      deleted: false,
    },
  };
}

function authorizationEvent(event: string, a: MockAuthorization) {
  const status = { pendente: "CREATED", ativa: "ACTIVE", recusada: "REFUSED", cancelada: "CANCELLED", expirada: "EXPIRED" }[a.status];
  return {
    id: evt(),
    event,
    authorization: { id: a.id, status, customerId: a.customerId, frequency: "MONTHLY", contractId: a.contractRef, cancellationReason: a.cancellationReason },
  };
}

export const mockSimulator = {
  /** Pagamento de uma cobrança Pix comum (ou paga por fora da instrução). */
  payCharge(chargeId: string, opts: { amountCents?: number; date?: string } = {}) {
    const c = state().charges.get(chargeId);
    if (!c) throw new Error(`Cobrança simulada não encontrada: ${chargeId}`);
    c.status = "paga";
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    const body = paymentEvent("PAYMENT_RECEIVED", c, date);
    if (opts.amountCents !== undefined) body.payment.value = centsToDecimal(opts.amountCents);
    return [body];
  },

  /**
   * Adesão: o pai paga o QR da autorização.
   * outcome "ativada": CREATED → PAYMENT_CREATED → PAYMENT_RECEIVED → ACTIVATED
   * outcome "recusada_apos_pagamento": ... → PAYMENT_RECEIVED → REFUSED
   * outcome "nao_pagou": CREATED → REFUSED (QR expirou)
   */
  enroll(authorizationId: string, outcome: "ativada" | "recusada_apos_pagamento" | "nao_pagou" = "ativada") {
    const a = state().authorizations.get(authorizationId);
    if (!a) throw new Error(`Autorização simulada não encontrada: ${authorizationId}`);
    const events: unknown[] = [authorizationEvent("PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED", a)];
    if (outcome === "nao_pagou") {
      a.status = "recusada";
      events.push(authorizationEvent("PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED", a));
      return events;
    }
    const first: MockCharge = {
      id: `pay_mock_${randomUUID().slice(0, 12)}`,
      status: "paga",
      amountCents: a.firstChargeCents,
      dueDate: new Date().toISOString().slice(0, 10),
      paymentLink: null,
      customerId: a.customerId,
      externalReference: "",
      authorizationId: a.id,
      deleted: false,
    };
    state().charges.set(first.id, first);
    events.push(paymentEvent("PAYMENT_CREATED", first), paymentEvent("PAYMENT_RECEIVED", first, first.dueDate));
    a.status = outcome === "ativada" ? "ativa" : "recusada";
    events.push(authorizationEvent(outcome === "ativada" ? "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED" : "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED", a));
    return events;
  },

  /** Débito automático de uma cobrança do Pix Automático. */
  debitInstruction(chargeId: string, outcome: "pago" | "recusado" = "pago") {
    const c = state().charges.get(chargeId);
    if (!c || !c.authorizationId) throw new Error(`Cobrança de Pix Automático não encontrada: ${chargeId}`);
    const instruction = (event: string, status: string) => ({
      id: evt(),
      event,
      paymentInstruction: { id: randomUUID(), status, dueDate: c.dueDate, paymentId: c.id, authorization: { id: c.authorizationId } },
    });
    const events: unknown[] = [instruction("PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED", "AWAITING_REQUEST")];
    events.push(instruction("PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED", "SCHEDULED"));
    if (outcome === "pago") {
      c.status = "paga";
      const confirmed = paymentEvent("PAYMENT_CONFIRMED", c, c.dueDate);
      confirmed.payment.status = "CONFIRMED";
      events.push(confirmed);
    } else {
      events.push(instruction("PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED", "REFUSED"));
    }
    return events;
  },

  overdue(chargeId: string) {
    const c = state().charges.get(chargeId);
    if (!c) throw new Error(`Cobrança simulada não encontrada: ${chargeId}`);
    c.status = "vencida";
    return [paymentEvent("PAYMENT_OVERDUE", c)];
  },

  /** Para inspeção em testes. */
  _state: state,
};
