/**
 * Implementação do PaymentProvider para o Asaas (API v3).
 *
 * Fonte de cada endpoint/campo: docs.asaas.com (consultado em 06/11/2026).
 *  - Autenticação: header `access_token` + `User-Agent` obrigatório.
 *    Sandbox https://api-sandbox.asaas.com/v3 · Produção https://api.asaas.com/v3
 *  - GET    /v3/myAccount/status/                    situação cadastral (teste de conexão)
 *  - POST   /v3/customers                             criar cliente
 *  - POST   /v3/payments                              criar cobrança (billingType PIX; com
 *                                                     pixAutomaticAuthorizationId = Pix Automático)
 *  - GET    /v3/payments/{id}/pixQrCode               QR Code + copia e cola
 *  - DELETE /v3/payments/{id}                         excluir cobrança
 *  - POST   /v3/pix/automatic/authorizations          autorização (Jornada 3, immediateQrCode)
 *  - GET    /v3/pix/automatic/authorizations/{id}     consultar autorização
 *  - DELETE /v3/pix/automatic/authorizations/{id}     cancelar autorização
 *  - POST   /v3/webhooks                              cadastrar webhook (authToken próprio)
 *  - Webhook: header `asaas-access-token`; corpo { id, event, payment | authorization | paymentInstruction | eligibility }
 *
 * Nada aqui decide regra de negócio: só traduz.
 */
import { centsToDecimal } from "@/lib/money";
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
  type ProviderAuthorizationStatus,
  type ProviderCharge,
  type ProviderChargeStatus,
  type ProviderEnvironment,
  type ProviderErrorKind,
  type RegisterWebhookInput,
  type WebhookEvent,
} from "../payment-provider";

export const ASAAS_BASE_URL: Record<ProviderEnvironment, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

const USER_AGENT = "cobranca-transporte-escolar/0.1";
const TIMEOUT_MS = 15_000;

/** Eventos que pedimos ao Asaas (lista de eventos válidos em POST /v3/webhooks). */
export const ASAAS_WEBHOOK_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CANCELLED",
  "PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED",
] as const;

type Fetch = typeof fetch;

// --- Mapeamentos de status -------------------------------------------------

export function mapPaymentStatus(status: string | undefined, deleted?: boolean): ProviderChargeStatus {
  if (deleted) return "cancelada";
  switch (status) {
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
      return "pendente";
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "paga";
    case "OVERDUE":
      return "vencida";
    case "REFUNDED":
      return "estornada";
    default:
      return "outro";
  }
}

export function mapAuthorizationStatus(status: string | undefined): ProviderAuthorizationStatus {
  switch (status) {
    case "ACTIVE":
      return "ativa";
    case "CANCELLED":
      return "cancelada";
    case "REFUSED":
      return "recusada";
    case "EXPIRED":
      return "expirada";
    case "CREATED":
    default:
      return "pendente";
  }
}

/** Reais (number) -> centavos sem erro de ponto flutuante. */
function toCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

// --- Provider ----------------------------------------------------------------

export class AsaasProvider implements PaymentProvider {
  readonly kind = "asaas" as const;
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    readonly environment: ProviderEnvironment,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    if (!apiKey) throw new Error("Chave do Asaas ausente");
    this.baseUrl = ASAAS_BASE_URL[environment];
  }

  // --- HTTP ---

  private async request<T>(operation: string, method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
    // Só GET é repetido automaticamente: POST não é idempotente no provedor.
    const attempts = method === "GET" ? 2 : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            access_token: this.apiKey,
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (err) {
        lastError = new ProviderError("indisponivel", DEFAULT_USER_MESSAGES.indisponivel, { operation, codes: [(err as Error).name] });
        continue;
      }

      if (res.ok) {
        const text = await res.text();
        return (text ? JSON.parse(text) : {}) as T;
      }

      const kind = statusToKind(res.status);
      const { codes, descriptions } = await readErrors(res);
      // A descrição do Asaas para erro de validação é em português e útil ao usuário.
      let userMessage = kind === "validacao" && descriptions.length ? descriptions.join(" ") : DEFAULT_USER_MESSAGES[kind];
      if (codes.includes("invalid_environment")) {
        userMessage =
          this.environment === "sandbox"
            ? "Esta chave é da conta de produção do Asaas. Aqui, por enquanto, use uma chave do Asaas Sandbox (teste)."
            : "Esta chave é do Asaas Sandbox (teste). Use a chave da sua conta de produção do Asaas.";
      }
      lastError = new ProviderError(kind, userMessage, { operation, status: res.status, codes });
      if (!(kind === "indisponivel" && attempt < attempts)) break;
    }
    throw lastError;
  }

  // --- Operações ---

  async testConnection(): Promise<ConnectionCheck> {
    try {
      const status = await this.request<{ general?: string }>("testConnection", "GET", "/myAccount/status/");
      const approved = status.general ? status.general === "APPROVED" : null;
      return {
        ok: true,
        accountApproved: approved,
        message: approved
          ? "Conexão feita! Sua conta no Asaas está aprovada."
          : "Conexão feita! Mas o cadastro da sua conta no Asaas ainda não foi aprovado. Termine o cadastro lá para começar a receber.",
      };
    } catch (err) {
      if (err instanceof ProviderError) return { ok: false, accountApproved: null, message: err.userMessage };
      throw err;
    }
  }

  async createCustomer(input: CreateCustomerInput) {
    const res = await this.request<{ id: string }>("createCustomer", "POST", "/customers", {
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      email: input.email ?? undefined,
      mobilePhone: input.mobilePhone ? input.mobilePhone.replace(/^55/, "") : undefined,
      externalReference: input.externalReference,
      // Quem lembra os pais é o motorista, pelo WhatsApp (régua do produto).
      notificationDisabled: true,
    });
    return { id: res.id };
  }

  async createPixCharge(input: CreatePixChargeInput): Promise<ProviderCharge> {
    const res = await this.request<Record<string, unknown>>("createPixCharge", "POST", "/payments", {
      customer: input.customerId,
      billingType: "PIX",
      value: centsToDecimal(input.amountCents),
      dueDate: input.dueDate,
      description: input.description.slice(0, 500),
      externalReference: input.externalReference,
      ...(input.authorizationId ? { pixAutomaticAuthorizationId: input.authorizationId } : {}),
    });
    return {
      id: String(res.id),
      status: mapPaymentStatus(str(res.status) ?? undefined, res.deleted === true),
      amountCents: toCents(res.value) ?? input.amountCents,
      dueDate: str(res.dueDate) ?? input.dueDate,
      paymentLink: str(res.invoiceUrl),
    };
  }

  async getPixQrCode(providerChargeId: string): Promise<PixQrCode> {
    const res = await this.request<Record<string, unknown>>("getPixQrCode", "GET", `/payments/${encodeURIComponent(providerChargeId)}/pixQrCode`);
    const payload = str(res.payload);
    if (!payload) throw new ProviderError("desconhecido", DEFAULT_USER_MESSAGES.desconhecido, { operation: "getPixQrCode", codes: ["sem_payload"] });
    return { payload, imageBase64: str(res.encodedImage), expiresAt: str(res.expirationDate) };
  }

  async cancelCharge(providerChargeId: string): Promise<void> {
    await this.request("cancelCharge", "DELETE", `/payments/${encodeURIComponent(providerChargeId)}`);
  }

  async createAuthorization(input: CreateAuthorizationInput): Promise<ProviderAuthorization> {
    if (input.contractRef.length > 35) throw new Error("contractRef deve ter no máximo 35 caracteres");
    const res = await this.request<Record<string, unknown>>("createAuthorization", "POST", "/pix/automatic/authorizations", {
      frequency: "MONTHLY",
      contractId: input.contractRef,
      startDate: input.startDate,
      ...(input.finishDate ? { finishDate: input.finishDate } : {}),
      description: input.description.slice(0, 35),
      customerId: input.customerId,
      // D3: sem `value` fixo; o pagador escolhe um teto >= minLimitValue.
      minLimitValue: centsToDecimal(input.minLimitCents),
      paymentCreationMode: "MANUAL",
      retryPolicy: input.allowRetries ? "ALLOW_THREE_IN_SEVEN_DAYS" : "NOT_ALLOWED",
      immediateQrCode: {
        expirationSeconds: input.firstCharge.expirationSeconds,
        originalValue: centsToDecimal(input.firstCharge.amountCents),
        description: input.firstCharge.description.slice(0, 140),
      },
    });
    return toAuthorization(res);
  }

  async getAuthorization(id: string): Promise<ProviderAuthorization> {
    return toAuthorization(await this.request("getAuthorization", "GET", `/pix/automatic/authorizations/${encodeURIComponent(id)}`));
  }

  async cancelAuthorization(id: string): Promise<ProviderAuthorization> {
    return toAuthorization(await this.request("cancelAuthorization", "DELETE", `/pix/automatic/authorizations/${encodeURIComponent(id)}`));
  }

  async registerWebhook(input: RegisterWebhookInput) {
    const res = await this.request<{ id: string }>("registerWebhook", "POST", "/webhooks", {
      name: "Cobrança transporte escolar",
      url: input.url,
      email: input.notificationEmail,
      enabled: true,
      interrupted: false,
      authToken: input.authToken,
      // Não dependemos da ordem: cada evento é idempotente e o estado só avança.
      sendType: "NON_SEQUENTIALLY",
      events: ASAAS_WEBHOOK_EVENTS,
    });
    return { id: res.id };
  }

  webhookToken(headers: Headers): string | null {
    return headers.get("asaas-access-token");
  }

  parseWebhook(body: unknown): WebhookEvent {
    return parseAsaasWebhook(body);
  }
}

// --- Funções auxiliares (exportadas para teste) -------------------------------

function statusToKind(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "autenticacao";
  if (status === 400 || status === 422) return "validacao";
  if (status === 404) return "nao_encontrado";
  if (status === 429) return "limite";
  if (status >= 500) return "indisponivel";
  return "desconhecido";
}

async function readErrors(res: Response): Promise<{ codes: string[]; descriptions: string[] }> {
  try {
    const data = (await res.json()) as { errors?: { code?: string; description?: string }[] };
    const errors = Array.isArray(data.errors) ? data.errors : [];
    return {
      codes: errors.map((e) => String(e.code ?? "")).filter(Boolean),
      descriptions: errors.map((e) => String(e.description ?? "")).filter(Boolean),
    };
  } catch {
    return { codes: [], descriptions: [] };
  }
}

function toAuthorization(res: unknown): ProviderAuthorization {
  const r = obj(res) ?? {};
  const qr = obj(r.immediateQrCode);
  return {
    id: String(r.id),
    status: mapAuthorizationStatus(str(r.status) ?? undefined),
    qrPayload: str(r.payload),
    qrImageBase64: str(r.encodedImage),
    qrExpiresAt: qr ? str(qr.expirationDate) : null,
    cancellationReason: str(r.cancellationReason),
  };
}

export function parseAsaasWebhook(body: unknown): WebhookEvent {
  const b = obj(body);
  const eventId = b ? str(b.id) : null;
  const type = b ? str(b.event) : null;
  if (!b || !eventId || !type) {
    throw new ProviderError("validacao", "Webhook inválido", { operation: "parseWebhook", codes: ["sem_id_ou_evento"] });
  }

  if (type.startsWith("PAYMENT_")) {
    const p = obj(b.payment);
    const id = p ? str(p.id) : null;
    if (!p || !id) return { kind: "ignored", eventId, type };
    const status = type === "PAYMENT_DELETED" ? "cancelada" : mapPaymentStatus(str(p.status) ?? undefined, p.deleted === true);
    return {
      kind: "charge",
      eventId,
      type,
      providerChargeId: id,
      status,
      amountCents: toCents(p.value),
      // paymentDate = liquidação no Asaas; clientPaymentDate = quando o cliente pagou.
      paidAt: status === "paga" ? (str(p.clientPaymentDate) ?? str(p.paymentDate) ?? str(p.confirmedDate)) : null,
      externalReference: str(p.externalReference),
    };
  }

  if (type.startsWith("PIX_AUTOMATIC_RECURRING_AUTHORIZATION_")) {
    const a = obj(b.authorization);
    const id = a ? str(a.id) : null;
    if (!a || !id) return { kind: "ignored", eventId, type };
    return { kind: "authorization", eventId, type, providerAuthorizationId: id, status: mapAuthorizationStatus(str(a.status) ?? undefined), reason: str(a.cancellationReason) };
  }

  if (type.startsWith("PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_")) {
    const i = obj(b.paymentInstruction);
    const outcome = ({ CREATED: "criada", SCHEDULED: "agendada", REFUSED: "recusada", CANCELLED: "cancelada" } as const)[
      type.replace("PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_", "") as "CREATED"
    ];
    if (!i || !outcome) return { kind: "ignored", eventId, type };
    return {
      kind: "instruction",
      eventId,
      type,
      providerChargeId: str(i.paymentId),
      providerAuthorizationId: str(obj(i.authorization)?.id),
      outcome,
    };
  }

  if (type === "PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED") {
    const e = obj(b.eligibility);
    return { kind: "eligibility", eventId, type, eligible: e?.status === "ELIGIBLE" };
  }

  return { kind: "ignored", eventId, type };
}
