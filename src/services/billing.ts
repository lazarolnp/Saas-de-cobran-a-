import "server-only";
import { decrypt, encrypt, randomToken, sha256 } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { todaySP } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENROLLMENT_LINK_DAYS } from "@/lib/product";
import {
  addMonths,
  chargeAmount,
  chargeDescription,
  chooseMethod,
  competencesToGenerate,
  dueDateFor,
  effectiveDueDate,
  firstCompetence,
  isBillableMonth,
  isWithinContract,
  shouldFallBackToPixComum,
  type ContractTerms,
} from "@/domain/billing";
import { ProviderError, type PaymentProvider } from "@/providers";
import { getProviderForTenant } from "./provider-connection";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Cobranças por competência, adesão e cobrança híbrida.
 *
 * Tudo aqui roda no servidor com service_role e SEMPRE filtra por tenant_id.
 * Idempotência: a linha da cobrança é criada antes de chamar o provedor e a
 * unicidade (contract_id, competence) impede duplicar o mesmo mês, mesmo que o
 * cron rode duas vezes ao mesmo tempo.
 */

type Db = ReturnType<typeof createAdminClient>;
type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];

const firstName = (s: string) => s.trim().split(/\s+/)[0] ?? s;

export class BillingError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

export function termsOf(c: ContractRow): ContractTerms {
  return {
    startDate: c.start_date,
    endDate: c.end_date,
    dueDay: c.due_day,
    monthsPolicy: c.months_policy,
    customMonths: c.custom_months,
    monthlyAmountCents: c.monthly_amount_cents,
    discount: { type: c.discount_type, value: c.discount_value },
    prorataFirstMonth: c.prorata_first_month,
  };
}

export function publicLinkUrl(token: string): string {
  return `${serverEnv().APP_URL.replace(/\/$/, "")}/p/${token}`;
}

// --- Links públicos ---------------------------------------------------------------

async function createLink(db: Db, input: { tenantId: string; contractId: string; chargeId: string; authorizationId: string | null; purpose: "adesao" | "cobranca"; expiresAt: string }) {
  const token = randomToken();
  const { error } = await db.from("enrollment_links").insert({
    tenant_id: input.tenantId,
    contract_id: input.contractId,
    charge_id: input.chargeId,
    authorization_id: input.authorizationId,
    purpose: input.purpose,
    token_hash: sha256(token),
    token_encrypted: encrypt(token, serverEnv().ENCRYPTION_KEY),
    expires_at: input.expiresAt,
  });
  if (error) throw new Error(`enrollment_links: ${error.code}`);
  return publicLinkUrl(token);
}

/** Link público vigente da cobrança (remontado a partir do token criptografado). */
export async function liveLinkForCharge(tenantId: string, chargeId: string, now = new Date()): Promise<{ url: string; purpose: "adesao" | "cobranca"; expiresAt: string } | null> {
  const { data } = await createAdminClient()
    .from("enrollment_links")
    .select("token_encrypted, purpose, expires_at")
    .eq("tenant_id", tenantId)
    .eq("charge_id", chargeId)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.token_encrypted) return null;
  return { url: publicLinkUrl(decrypt(data.token_encrypted, serverEnv().ENCRYPTION_KEY)), purpose: data.purpose, expiresAt: data.expires_at };
}

// --- Cliente no provedor -------------------------------------------------------------

async function ensureCustomer(db: Db, provider: PaymentProvider, tenantId: string, guardianId: string): Promise<string> {
  const { data: g, error } = await db
    .from("guardians")
    .select("id, name, cpf_encrypted, whatsapp, email, provider_customer_id")
    .eq("tenant_id", tenantId)
    .eq("id", guardianId)
    .single();
  if (error || !g) throw new Error("responsável não encontrado");
  if (g.provider_customer_id) return g.provider_customer_id;
  if (!g.cpf_encrypted) throw new BillingError("Falta o CPF de quem paga. Edite o cadastro do aluno.");
  const { id } = await provider.createCustomer({
    name: g.name,
    cpfCnpj: decrypt(g.cpf_encrypted, serverEnv().ENCRYPTION_KEY),
    email: g.email,
    mobilePhone: g.whatsapp,
    externalReference: g.id,
  });
  await db.from("guardians").update({ provider_customer_id: id }).eq("tenant_id", tenantId).eq("id", g.id);
  return id;
}

// --- Envio de uma cobrança ao provedor -----------------------------------------------------

/**
 * Manda ao provedor uma cobrança "agendada". Escolhe Pix Automático ou Pix
 * comum na hora do envio (cobrança híbrida). Em caso de falha, a linha fica
 * "agendada" com o erro anotado e o cron tenta de novo no dia seguinte.
 */
async function sendCharge(db: Db, provider: PaymentProvider, tenantId: string, chargeId: string, today: string): Promise<"enviada" | "falhou"> {
  const { data: ch } = await db
    .from("charges")
    .select("id, contract_id, competence, amount_cents, due_date, status, send_attempts, contract:contracts(payer_guardian_id, billing_mode, student:students(name))")
    .eq("tenant_id", tenantId)
    .eq("id", chargeId)
    .single();
  if (!ch || ch.status !== "agendada" || !ch.contract) return "falhou";

  const { data: auth } = await db
    .from("authorizations")
    .select("id, provider_authorization_id")
    .eq("tenant_id", tenantId)
    .eq("contract_id", ch.contract_id)
    .eq("status", "ativa")
    .maybeSingle();

  const dueDate = effectiveDueDate(ch.due_date, today);
  let method = chooseMethod({ authorizationActive: Boolean(auth?.provider_authorization_id), dueDate, today });
  try {
    const customerId = await ensureCustomer(db, provider, tenantId, ch.contract.payer_guardian_id);
    const input = {
      customerId,
      amountCents: ch.amount_cents,
      dueDate,
      description: chargeDescription(firstName(ch.contract.student?.name ?? ""), ch.competence),
      externalReference: ch.id,
    };
    let created;
    try {
      created = await provider.createPixCharge({ ...input, authorizationId: method === "pix_automatico" ? auth!.provider_authorization_id : null });
    } catch (err) {
      // O provedor recusou vincular à autorização (ex.: o pai cancelou no banco e
      // o aviso ainda não chegou). Não deixa a cobrança parada: sai como Pix comum.
      if (!(method === "pix_automatico" && err instanceof ProviderError && err.kind === "validacao")) throw err;
      logger.warn("pix_automatico_recusado_fallback", { tenantId, chargeId, codes: err.technical.codes });
      method = "pix_comum";
      created = await provider.createPixCharge({ ...input, authorizationId: null });
    }
    // Pix comum precisa do QR/copia e cola para o link e para os lembretes.
    const qr = method === "pix_comum" ? await provider.getPixQrCode(created.id) : null;
    const { error } = await db
      .from("charges")
      .update({
        status: "enviada",
        method,
        due_date: dueDate,
        authorization_id: method === "pix_automatico" ? auth!.id : null,
        provider: provider.kind,
        provider_charge_id: created.id,
        payment_link: created.paymentLink,
        pix_payload: qr?.payload ?? null,
        send_attempts: ch.send_attempts + 1,
        last_send_error: null,
      })
      .eq("tenant_id", tenantId)
      .eq("id", ch.id)
      .eq("status", "agendada");
    if (error) throw new Error(`charges update: ${error.code}`);
    if (method === "pix_comum") {
      await createLink(db, { tenantId, contractId: ch.contract_id, chargeId: ch.id, authorizationId: null, purpose: "cobranca", expiresAt: `${addMonths(dueDate.slice(0, 8) + "01", 3)}T03:00:00Z` });
    }
    return "enviada";
  } catch (err) {
    const message = err instanceof ProviderError ? err.userMessage : err instanceof BillingError ? err.userMessage : "Erro ao gerar a cobrança no provedor.";
    logger.error("enviar_cobranca_falhou", { tenantId, chargeId, kind: err instanceof ProviderError ? err.kind : "erro", codes: err instanceof ProviderError ? err.technical.codes : undefined });
    await db.from("charges").update({ send_attempts: ch.send_attempts + 1, last_send_error: message }).eq("tenant_id", tenantId).eq("id", ch.id);
    return "falhou";
  }
}

// --- Adesão ----------------------------------------------------------------------------------

export interface EnrollmentResult {
  url: string;
  purpose: "adesao" | "cobranca";
  amountCents: number;
  competence: string;
  dueDate: string;
}

/**
 * Gera o link de adesão do contrato.
 *
 * - Tenant elegível: cria a autorização do Pix Automático com QR imediato
 *   (Jornada 3). Pagar o 1º mês = autorizar os próximos. O QR expira em
 *   ENROLLMENT_LINK_DAYS dias; se ninguém pagar, o provedor recusa a
 *   autorização e o contrato passa para Pix comum (D8).
 * - Sem Pix Automático (ou se o provedor recusar): gera um Pix comum.
 *
 * A 1ª cobrança é a mais antiga ainda em aberto (convertida) ou a próxima
 * competência ainda não gerada.
 */
export async function issueEnrollment(tenantId: string, contractId: string, now = new Date(), today = todaySP(now)): Promise<EnrollmentResult> {
  const db = createAdminClient();
  const provider = await getProviderForTenant(tenantId);
  if (!provider) throw new BillingError("Conecte sua conta de recebimento antes (Ajustes → Onde você recebe).");

  const { data: contract } = await db
    .from("contracts")
    .select("*, student:students(name), tenant:tenants(pix_automatico_eligibility)")
    .eq("tenant_id", tenantId)
    .eq("id", contractId)
    .single();
  if (!contract || contract.status !== "ativo") throw new BillingError("Só dá para gerar o link de um contrato ativo.");
  if (contract.billing_mode === "pix_automatico") throw new BillingError("Este responsável já autorizou o Pix Automático.");
  const terms = termsOf(contract);

  // Revoga links de adesão anteriores e libera autorização pendente antiga.
  await db.from("enrollment_links").update({ revoked_at: now.toISOString() }).eq("tenant_id", tenantId).eq("contract_id", contractId).eq("purpose", "adesao").is("revoked_at", null);
  const { data: oldAuth } = await db.from("authorizations").select("id, provider_authorization_id, attempt").eq("tenant_id", tenantId).eq("contract_id", contractId).eq("status", "pendente").maybeSingle();
  if (oldAuth) {
    if (oldAuth.provider_authorization_id) {
      await provider.cancelAuthorization(oldAuth.provider_authorization_id).catch(() => undefined); // pode já ter expirado (A4)
    }
    await db.from("authorizations").update({ status: "cancelada", ended_at: now.toISOString(), end_reason: "substituida_por_novo_link" }).eq("tenant_id", tenantId).eq("id", oldAuth.id);
  }

  // Qual cobrança a adesão vai pagar.
  const { data: charges } = await db
    .from("charges")
    .select("id, competence, status, provider_charge_id, method, amount_cents")
    .eq("tenant_id", tenantId)
    .eq("contract_id", contractId)
    .order("competence");
  const open = (charges ?? []).find((c) => c.status === "agendada" || c.status === "enviada" || c.status === "atrasada");
  let competence: string;
  let amountCents: number;
  if (open) {
    competence = open.competence;
    amountCents = open.amount_cents;
  } else {
    const taken = new Set((charges ?? []).map((c) => c.competence));
    let c = firstCompetence(terms);
    while (c && (taken.has(c) || !isBillableMonth(terms, c))) c = addMonths(c, 1);
    if (!c || !isWithinContract(terms, c)) throw new BillingError("Não há mais meses com cobrança neste contrato.");
    competence = c;
    amountCents = chargeAmount(terms, c).amountCents;
  }

  const customerId = await ensureCustomer(db, provider, tenantId, contract.payer_guardian_id);
  const studentFirst = firstName(contract.student?.name ?? "");
  const eligible = contract.tenant?.pix_automatico_eligibility !== "nao_elegivel";
  const expiresAt = new Date(now.getTime() + ENROLLMENT_LINK_DAYS * 86_400_000).toISOString();

  // Cancela no provedor o Pix comum da cobrança que vamos converter (evita pagamento em dobro).
  const cancelOpenProviderCharge = async () => {
    if (open?.provider_charge_id) {
      await provider.cancelCharge(open.provider_charge_id);
      await db.from("enrollment_links").update({ revoked_at: now.toISOString() }).eq("tenant_id", tenantId).eq("charge_id", open.id).is("revoked_at", null);
    }
  };

  if (eligible) {
    const attempt = (oldAuth?.attempt ?? 0) + 1;
    try {
      const auth = await provider.createAuthorization({
        customerId,
        contractRef: `${contractId.replace(/-/g, "")}${String(attempt).padStart(2, "0")}`.slice(0, 35),
        startDate: today,
        finishDate: contract.end_date,
        minLimitCents: chargeAmount({ ...terms, prorataFirstMonth: false }, competence).amountCents,
        firstCharge: { amountCents, description: chargeDescription(studentFirst, competence), expirationSeconds: ENROLLMENT_LINK_DAYS * 86_400 },
        description: `Transporte ${studentFirst}`.slice(0, 35),
        allowRetries: true, // D4
      });
      await cancelOpenProviderCharge();
      const { data: authRow, error: authErr } = await db
        .from("authorizations")
        .insert({
          tenant_id: tenantId,
          contract_id: contractId,
          provider: provider.kind,
          provider_authorization_id: auth.id,
          status: "pendente",
          min_limit_cents: chargeAmount({ ...terms, prorataFirstMonth: false }, competence).amountCents,
          starts_on: today,
          attempt,
        })
        .select("id")
        .single();
      if (authErr || !authRow) throw new Error(`authorizations: ${authErr?.code}`);

      const chargeRow = {
        tenant_id: tenantId,
        contract_id: contractId,
        authorization_id: authRow.id,
        competence,
        amount_cents: amountCents,
        discount_cents: chargeAmount(terms, competence).discountCents,
        // Vence junto com o QR da adesão: não fica "atrasada" enquanto o pai ainda pode autorizar.
        due_date: todaySP(new Date(expiresAt)),
        original_due_date: dueDateFor(competence, terms.dueDay),
        status: "enviada" as const,
        method: "pix_automatico" as const,
        is_enrollment: true,
        provider: provider.kind,
        // A1: o provedor não devolve o id da cobrança imediata na criação.
        provider_charge_id: null,
        payment_link: null,
        pix_payload: auth.qrPayload,
      };
      const chargeId = await upsertCharge(db, tenantId, open?.id ?? null, chargeRow);
      await db.from("contracts").update({ billing_mode: "aguardando_adesao" }).eq("tenant_id", tenantId).eq("id", contractId);
      const url = await createLink(db, { tenantId, contractId, chargeId, authorizationId: authRow.id, purpose: "adesao", expiresAt });
      return { url, purpose: "adesao", amountCents, competence, dueDate: chargeRow.due_date };
    } catch (err) {
      // Conta não elegível ou recusa do provedor: segue em Pix comum, sem travar o motorista.
      if (!(err instanceof ProviderError && err.kind === "validacao")) throw toBillingError(err);
      logger.warn("autorizacao_recusada_fallback_pix_comum", { tenantId, codes: err.technical.codes });
    }
  }

  // Pix comum.
  if (open?.provider_charge_id && open.method === "pix_comum") {
    // Já existe um Pix comum em aberto: só gera um link novo para ele.
    const url = await createLink(db, { tenantId, contractId, chargeId: open.id, authorizationId: null, purpose: "cobranca", expiresAt: `${addMonths(competence, 3)}T03:00:00Z` });
    await db.from("contracts").update({ billing_mode: "pix_comum" }).eq("tenant_id", tenantId).eq("id", contractId);
    const { data: openRow } = await db.from("charges").select("due_date").eq("tenant_id", tenantId).eq("id", open.id).single();
    return { url, purpose: "cobranca", amountCents, competence, dueDate: openRow?.due_date ?? today };
  }
  const dueDate = effectiveDueDate(dueDateFor(competence, terms.dueDay), today);
  try {
    await cancelOpenProviderCharge();
    const created = await provider.createPixCharge({ customerId, amountCents, dueDate, description: chargeDescription(studentFirst, competence), externalReference: open?.id ?? `${contractId}:${competence}` });
    const qr = await provider.getPixQrCode(created.id);
    const chargeId = await upsertCharge(db, tenantId, open?.id ?? null, {
      tenant_id: tenantId,
      contract_id: contractId,
      authorization_id: null,
      competence,
      amount_cents: amountCents,
      discount_cents: chargeAmount(terms, competence).discountCents,
      due_date: dueDate,
      original_due_date: dueDateFor(competence, terms.dueDay),
      status: "enviada",
      method: "pix_comum",
      is_enrollment: false,
      provider: provider.kind,
      provider_charge_id: created.id,
      payment_link: created.paymentLink,
      pix_payload: qr.payload,
    });
    await db.from("contracts").update({ billing_mode: "pix_comum" }).eq("tenant_id", tenantId).eq("id", contractId);
    const url = await createLink(db, { tenantId, contractId, chargeId, authorizationId: null, purpose: "cobranca", expiresAt: `${addMonths(competence, 3)}T03:00:00Z` });
    return { url, purpose: "cobranca", amountCents, competence, dueDate };
  } catch (err) {
    throw toBillingError(err);
  }
}

type ChargeInsert = Database["public"]["Tables"]["charges"]["Insert"];

async function upsertCharge(db: Db, tenantId: string, existingId: string | null, row: ChargeInsert): Promise<string> {
  if (existingId) {
    const { error } = await db.from("charges").update(row).eq("tenant_id", tenantId).eq("id", existingId);
    if (error) throw new Error(`charges update: ${error.code}`);
    return existingId;
  }
  const { data, error } = await db.from("charges").insert(row).select("id").single();
  if (error || !data) throw new Error(`charges insert: ${error?.code}`);
  return data.id;
}

function toBillingError(err: unknown): BillingError {
  if (err instanceof BillingError) return err;
  if (err instanceof ProviderError) {
    logger.error("provedor_falhou", { kind: err.kind, op: err.technical.operation, codes: err.technical.codes });
    return new BillingError(err.userMessage);
  }
  logger.error("adesao_falhou", { err });
  return new BillingError("Não foi possível gerar o link agora. Tente de novo em instantes.");
}

// --- Rotina diária -----------------------------------------------------------------------------

export interface DailyResult {
  fallbacks: number;
  generated: number;
  sent: number;
  failed: number;
  overdue: number;
}

/**
 * Rotina diária de um tenant (cron). Ordem:
 *  1. D8: adesões vencidas sem pagamento viram Pix comum.
 *  2. Gera as cobranças das competências que entraram na janela.
 *  3. Envia ao provedor as "agendadas" (novas e retentativas).
 *  4. Marca como "atrasada" o que venceu ontem ou antes sem pagamento.
 */
export async function runDailyBilling(tenantId: string, now = new Date(), today = todaySP(now)): Promise<DailyResult> {
  const db = createAdminClient();
  const result: DailyResult = { fallbacks: 0, generated: 0, sent: 0, failed: 0, overdue: 0 };
  const provider = await getProviderForTenant(tenantId);

  const { data: contracts } = await db
    .from("contracts")
    .select("*, enrollment_links(purpose, expires_at, revoked_at), charges(id, competence, status, is_enrollment, method, provider_charge_id)")
    .eq("tenant_id", tenantId)
    .eq("status", "ativo");

  for (const c of contracts ?? []) {
    // 1. Cobrança híbrida (D8).
    const live = c.enrollment_links.filter((l) => l.purpose === "adesao" && !l.revoked_at).sort((a, b) => (a.expires_at < b.expires_at ? 1 : -1))[0];
    if (shouldFallBackToPixComum({ billingMode: c.billing_mode, contractCreatedAt: c.created_at, liveLinkExpiresAt: live?.expires_at ?? null, now: now.toISOString(), graceDays: ENROLLMENT_LINK_DAYS })) {
      await db.from("contracts").update({ billing_mode: "pix_comum" }).eq("tenant_id", tenantId).eq("id", c.id);
      await db.from("enrollment_links").update({ revoked_at: now.toISOString() }).eq("tenant_id", tenantId).eq("contract_id", c.id).eq("purpose", "adesao").is("revoked_at", null);
      await db.from("authorizations").update({ status: "recusada", ended_at: now.toISOString(), end_reason: "qr_expirou_sem_pagamento" }).eq("tenant_id", tenantId).eq("contract_id", c.id).eq("status", "pendente");
      // A 1ª cobrança (que era o QR da adesão) volta para "agendada" e sai como Pix comum.
      const enrollment = c.charges.find((x) => x.is_enrollment && x.status === "enviada" && !x.provider_charge_id);
      if (enrollment) {
        await db
          .from("charges")
          .update({ status: "agendada", method: "pix_comum", is_enrollment: false, authorization_id: null, pix_payload: null, due_date: effectiveDueDate(dueDateFor(enrollment.competence, c.due_day), today) })
          .eq("tenant_id", tenantId)
          .eq("id", enrollment.id);
      }
      c.billing_mode = "pix_comum";
      result.fallbacks++;
    }

    // 2. Novas competências. Contrato aguardando o 1º link não gera nada sozinho
    //    (a 1ª cobrança é a da adesão; depois de 7 dias, cai no passo 1).
    if (c.billing_mode === "aguardando_adesao" && c.charges.length === 0) continue;
    const existing = new Set(c.charges.map((x) => x.competence));
    for (const competence of competencesToGenerate(termsOf(c), today, existing)) {
      const amount = chargeAmount(termsOf(c), competence);
      const due = dueDateFor(competence, c.due_day);
      const { error } = await db.from("charges").insert({
        tenant_id: tenantId,
        contract_id: c.id,
        competence,
        amount_cents: amount.amountCents,
        discount_cents: amount.discountCents,
        due_date: effectiveDueDate(due, today),
        original_due_date: due,
        status: "agendada",
        method: c.billing_mode === "pix_automatico" ? "pix_automatico" : "pix_comum",
      });
      if (!error) result.generated++;
      else if (error.code !== "23505") logger.error("gerar_cobranca_falhou", { tenantId, code: error.code });
    }
  }

  // 3. Envio (novas e retentativas).
  if (provider) {
    const { data: pending } = await db.from("charges").select("id").eq("tenant_id", tenantId).eq("status", "agendada").lt("send_attempts", 5).order("due_date").limit(500);
    for (const p of pending ?? []) {
      const r = await sendCharge(db, provider, tenantId, p.id, today);
      if (r === "enviada") result.sent++;
      else result.failed++;
    }
  } else {
    await db.from("charges").update({ last_send_error: "Conta de recebimento não conectada." }).eq("tenant_id", tenantId).eq("status", "agendada");
  }

  // 4. Atrasos: no dia seguinte ao vencimento sem pagamento.
  const { data: late } = await db.from("charges").update({ status: "atrasada" }).eq("tenant_id", tenantId).eq("status", "enviada").lt("due_date", today).select("id");
  result.overdue = late?.length ?? 0;

  return result;
}
