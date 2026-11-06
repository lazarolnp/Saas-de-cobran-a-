/**
 * Contrato neutro com o provedor de pagamentos.
 *
 * Nenhuma regra de negócio importa o Asaas diretamente: tudo passa por esta
 * interface, com valores em CENTAVOS e datas "AAAA-MM-DD". Cada implementação
 * (AsaasProvider, MockProvider) traduz para o formato do seu provedor.
 */

export type ProviderKind = "asaas" | "mock";
export type ProviderEnvironment = "sandbox" | "producao";

/** Status de cobrança no vocabulário do nosso sistema. */
export type ProviderChargeStatus = "pendente" | "paga" | "vencida" | "estornada" | "cancelada" | "outro";

/** Status de autorização do Pix Automático (mesmos nomes do banco). */
export type ProviderAuthorizationStatus = "pendente" | "ativa" | "recusada" | "cancelada" | "expirada";

export interface ConnectionCheck {
  /** A chave funcionou. */
  ok: boolean;
  /** Cadastro da conta aprovado no provedor (null = não foi possível saber). */
  accountApproved: boolean | null;
  /** Texto curto, em linguagem simples, para mostrar ao motorista. */
  message: string;
}

export interface CreateCustomerInput {
  name: string;
  /** Só dígitos. */
  cpfCnpj: string;
  email?: string | null;
  /** "55DDNNNNNNNNN" */
  mobilePhone?: string | null;
  /** Nosso id (guardians.id). */
  externalReference: string;
}

export interface CreatePixChargeInput {
  customerId: string;
  amountCents: number;
  dueDate: string;
  description: string;
  /** Nosso id (charges.id). */
  externalReference: string;
  /** Preenchido = cobrança do Pix Automático; vazio = Pix comum. */
  authorizationId?: string | null;
}

export interface ProviderCharge {
  id: string;
  status: ProviderChargeStatus;
  amountCents: number;
  dueDate: string;
  paymentLink: string | null;
}

export interface PixQrCode {
  /** "Copia e cola". */
  payload: string;
  /** PNG em base64 (sem o prefixo data:). */
  imageBase64: string | null;
  expiresAt: string | null;
}

export interface CreateAuthorizationInput {
  customerId: string;
  /** Identificador do contrato no provedor (máx. 35 caracteres). */
  contractRef: string;
  startDate: string;
  finishDate?: string | null;
  /** Piso que o pagador precisa aceitar como valor máximo (D3: valor variável). */
  minLimitCents: number;
  /** 1ª cobrança, paga no mesmo QR Code da adesão. */
  firstCharge: { amountCents: number; description: string; expirationSeconds: number };
  /** Texto curto exibido no app do banco (máx. 35 caracteres). */
  description: string;
  /** D4: permitir até 3 retentativas em 7 dias após o vencimento. */
  allowRetries: boolean;
}

export interface ProviderAuthorization {
  id: string;
  status: ProviderAuthorizationStatus;
  /** QR Code da adesão (só na criação ou enquanto pendente). */
  qrPayload: string | null;
  qrImageBase64: string | null;
  qrExpiresAt: string | null;
  cancellationReason: string | null;
}

export interface RegisterWebhookInput {
  url: string;
  /** Token que o provedor devolverá em cada chamada. */
  authToken: string;
  /** E-mail que recebe avisos do provedor sobre falhas na fila. */
  notificationEmail: string;
}

/** Evento de webhook já traduzido para o nosso vocabulário. */
export type WebhookEvent =
  | { kind: "charge"; eventId: string; type: string; providerChargeId: string; status: ProviderChargeStatus; amountCents: number | null; paidAt: string | null; externalReference: string | null }
  | { kind: "authorization"; eventId: string; type: string; providerAuthorizationId: string; status: ProviderAuthorizationStatus; reason: string | null }
  | { kind: "instruction"; eventId: string; type: string; providerChargeId: string | null; providerAuthorizationId: string | null; outcome: "agendada" | "recusada" | "cancelada" | "criada" }
  | { kind: "eligibility"; eventId: string; type: string; eligible: boolean }
  | { kind: "ignored"; eventId: string; type: string };

export interface PaymentProvider {
  readonly kind: ProviderKind;
  readonly environment: ProviderEnvironment;

  testConnection(): Promise<ConnectionCheck>;
  createCustomer(input: CreateCustomerInput): Promise<{ id: string }>;
  createPixCharge(input: CreatePixChargeInput): Promise<ProviderCharge>;
  getPixQrCode(providerChargeId: string): Promise<PixQrCode>;
  cancelCharge(providerChargeId: string): Promise<void>;
  createAuthorization(input: CreateAuthorizationInput): Promise<ProviderAuthorization>;
  getAuthorization(providerAuthorizationId: string): Promise<ProviderAuthorization>;
  cancelAuthorization(providerAuthorizationId: string): Promise<ProviderAuthorization>;
  registerWebhook(input: RegisterWebhookInput): Promise<{ id: string }>;

  /** Lê o token de autenticação enviado pelo provedor no webhook. */
  webhookToken(headers: Headers): string | null;
  /** Valida o formato e traduz o corpo do webhook. Lança ProviderError se inválido. */
  parseWebhook(body: unknown): WebhookEvent;
}

/**
 * Erro do provedor com duas mensagens separadas:
 *  - userMessage: pode ir para a tela;
 *  - technical: só para o log interno (já sem dados sensíveis).
 */
export type ProviderErrorKind = "autenticacao" | "validacao" | "nao_encontrado" | "indisponivel" | "limite" | "desconhecido";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly userMessage: string,
    readonly technical: { status?: number; codes?: string[]; operation: string },
  ) {
    super(`${technical.operation}: ${kind}${technical.status ? ` (${technical.status})` : ""}`);
    this.name = "ProviderError";
  }
}

export const DEFAULT_USER_MESSAGES: Record<ProviderErrorKind, string> = {
  autenticacao: "A chave de acesso não foi aceita. Confira se copiou a chave inteira e se ela é do ambiente certo.",
  validacao: "O provedor recusou alguns dados. Confira as informações e tente de novo.",
  nao_encontrado: "Não encontramos esse registro no provedor de pagamentos.",
  indisponivel: "O provedor de pagamentos não respondeu agora. Tente de novo em alguns minutos.",
  limite: "Muitas requisições ao provedor em pouco tempo. Aguarde um minuto e tente de novo.",
  desconhecido: "Algo deu errado ao falar com o provedor de pagamentos. Tente de novo em alguns minutos.",
};
