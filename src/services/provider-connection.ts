import "server-only";
import { serverEnv } from "@/lib/env";
import { decrypt, encrypt, randomToken, sha256 } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  availableProviders,
  createProvider,
  providerEnvironmentFor,
  ProviderError,
  type PaymentProvider,
  type ProviderKind,
} from "@/providers";

/**
 * Conexão do tenant com o provedor de pagamentos.
 *
 * Regras:
 *  - A chave só é gravada depois de passar no teste de conexão.
 *  - A chave é guardada criptografada; o texto puro só existe na memória do
 *    servidor durante a chamada. Nunca vai para log, tela ou resposta.
 *  - Todas as consultas usam service_role e filtram por tenant_id explicitamente.
 */

export type WebhookSetup =
  | { mode: "automatico" }
  /** O token aparece UMA vez para o motorista colar no provedor; depois só guardamos o hash. */
  | { mode: "manual"; url: string; token: string; reason: string };

export type ConnectResult =
  | { ok: true; message: string; accountApproved: boolean | null; webhook: WebhookSetup }
  | { ok: false; message: string };

interface Actor {
  tenantId: string;
  userId: string;
  userEmail: string;
}

/** Só registra o webhook sozinho se a URL do app for pública (https, fora do localhost). */
export function isPublicUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !["localhost", "127.0.0.1", "0.0.0.0"].includes(u.hostname) && !u.hostname.endsWith(".local");
  } catch {
    return false;
  }
}

export function webhookUrl(provider: ProviderKind, publicId: string): string {
  return `${serverEnv().APP_URL.replace(/\/$/, "")}/api/webhooks/${provider}/${publicId}`;
}

async function audit(actor: Actor, action: string, metadata: Record<string, string | number | boolean | null> = {}) {
  const { error } = await createAdminClient()
    .from("audit_log")
    .insert({ tenant_id: actor.tenantId, actor_user_id: actor.userId, action, entity: "provider_connections", metadata });
  if (error) logger.error("audit_falhou", { action, code: error.code });
}

export async function connectProvider(actor: Actor, input: { provider: ProviderKind; apiKey: string }): Promise<ConnectResult> {
  const env = serverEnv();
  const apiKey = input.apiKey.trim();
  if (!availableProviders(env.APP_ENV).includes(input.provider)) {
    return { ok: false, message: "Este provedor não está disponível." };
  }
  if (apiKey.length < 8 || apiKey.length > 500 || /\s/.test(apiKey)) {
    return { ok: false, message: "Essa chave não parece completa. Copie a chave inteira, sem espaços." };
  }

  const provider = createProvider(input.provider, apiKey, env.APP_ENV);
  let check;
  try {
    check = await provider.testConnection();
  } catch (err) {
    logger.error("teste_conexao_erro", { tenantId: actor.tenantId, err });
    return { ok: false, message: "Não conseguimos testar a chave agora. Tente de novo em alguns minutos." };
  }
  if (!check.ok) {
    await audit(actor, "provedor.conexao_recusada", { provider: input.provider });
    return { ok: false, message: check.message };
  }

  const db = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await db.from("provider_connections").upsert(
    {
      tenant_id: actor.tenantId,
      provider: input.provider,
      environment: providerEnvironmentFor(env.APP_ENV),
      api_key_encrypted: encrypt(apiKey, env.ENCRYPTION_KEY),
      api_key_hint: apiKey.slice(-4),
      status: "ok",
      validated_at: now,
      last_error_message: check.accountApproved === false ? check.message : null,
    },
    { onConflict: "tenant_id,provider" },
  );
  if (error) {
    logger.error("salvar_conexao_falhou", { tenantId: actor.tenantId, code: error.code });
    return { ok: false, message: "A chave funcionou, mas não conseguimos salvar. Tente de novo." };
  }
  // MVP: um provedor ativo por tenant. Ao conectar um, remove o outro.
  await db.from("provider_connections").delete().eq("tenant_id", actor.tenantId).neq("provider", input.provider);

  const webhook = await setupWebhook(actor, provider);
  await audit(actor, "provedor.conectado", { provider: input.provider, webhook: webhook.mode, accountApproved: check.accountApproved });
  return { ok: true, message: check.message, accountApproved: check.accountApproved, webhook };
}

/**
 * Cria (ou renova) a URL de webhook do tenant com um token novo e tenta
 * cadastrá-la no provedor pela API. Se não der, devolve o passo a passo manual.
 */
export async function setupWebhook(actor: Actor, provider: PaymentProvider): Promise<WebhookSetup> {
  const db = createAdminClient();
  const token = randomToken();
  const existing = await db
    .from("webhook_endpoints")
    .select("public_id")
    .eq("tenant_id", actor.tenantId)
    .eq("provider", provider.kind)
    .maybeSingle();
  const publicId = existing.data?.public_id ?? randomToken(18);

  const { error } = await db
    .from("webhook_endpoints")
    .upsert({ tenant_id: actor.tenantId, provider: provider.kind, public_id: publicId, token_hash: sha256(token) }, { onConflict: "tenant_id,provider" });
  if (error) throw new Error(`webhook_endpoints: ${error.code}`);

  const url = webhookUrl(provider.kind, publicId);
  if (!isPublicUrl(url) && provider.kind !== "mock") {
    return { mode: "manual", url, token, reason: "O endereço deste sistema ainda não é público, então o aviso automático não pode ser cadastrado sozinho." };
  }
  try {
    await provider.registerWebhook({ url, authToken: token, notificationEmail: actor.userEmail });
    return { mode: "automatico" };
  } catch (err) {
    logger.warn("registrar_webhook_falhou", { tenantId: actor.tenantId, kind: err instanceof ProviderError ? err.kind : "erro", codes: err instanceof ProviderError ? err.technical.codes : undefined });
    return { mode: "manual", url, token, reason: "Não conseguimos cadastrar o aviso automático no provedor. Faça o cadastro manual abaixo." };
  }
}

/** Testa de novo a chave salva e atualiza o status. */
export async function retestConnection(actor: Actor): Promise<{ ok: boolean; message: string }> {
  const provider = await getProviderForTenant(actor.tenantId);
  if (!provider) return { ok: false, message: "Nenhuma conta de recebimento conectada ainda." };
  let check;
  try {
    check = await provider.testConnection();
  } catch (err) {
    logger.error("reteste_erro", { tenantId: actor.tenantId, err });
    check = { ok: false, accountApproved: null, message: "Não conseguimos testar agora. Tente de novo em alguns minutos." };
  }
  await createAdminClient()
    .from("provider_connections")
    .update({
      status: check.ok ? "ok" : "erro",
      validated_at: check.ok ? new Date().toISOString() : undefined,
      last_error_message: check.ok ? (check.accountApproved === false ? check.message : null) : check.message,
    })
    .eq("tenant_id", actor.tenantId)
    .eq("provider", provider.kind);
  await audit(actor, "provedor.testado", { ok: check.ok });
  return { ok: check.ok, message: check.message };
}

export async function regenerateWebhook(actor: Actor): Promise<WebhookSetup | null> {
  const provider = await getProviderForTenant(actor.tenantId);
  if (!provider) return null;
  const result = await setupWebhook(actor, provider);
  await audit(actor, "provedor.webhook_renovado", { mode: result.mode });
  return result;
}

/** Monta o provedor do tenant com a chave decriptada. Use só no servidor. */
export async function getProviderForTenant(tenantId: string): Promise<PaymentProvider | null> {
  const env = serverEnv();
  const { data, error } = await createAdminClient()
    .from("provider_connections")
    .select("provider, api_key_encrypted")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return createProvider(data.provider, decrypt(data.api_key_encrypted, env.ENCRYPTION_KEY), env.APP_ENV);
}

/** D2: resposta do motorista sobre CNPJ/MEI com mais de 6 meses. */
export async function setEligibility(actor: Actor, eligible: boolean) {
  const { error } = await createAdminClient()
    .from("tenants")
    .update({ pix_automatico_eligibility: eligible ? "elegivel" : "nao_elegivel" })
    .eq("id", actor.tenantId);
  if (error) throw new Error(`tenants: ${error.code}`);
  await audit(actor, "tenant.elegibilidade", { eligible });
}
