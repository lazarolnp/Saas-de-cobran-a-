import "server-only";
import { sha256 } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { discountedAmount } from "@/domain/registration";

/** Versão do texto de aceite mostrado ao responsável (muda quando o texto mudar). */
export const CONSENT_TEXT_VERSION = "2026-11-provisorio-v1";

/**
 * Dados da página pública. Somente o necessário: primeiro nome do aluno, nome
 * do transporte e valores. Nada de escola, rota, CPF ou telefone do pai.
 */
export interface PublicLinkView {
  state: "invalido" | "expirado" | "pago" | "cancelado" | "aberto";
  purpose: "adesao" | "cobranca";
  needsConsent: boolean;
  tenantName: string;
  tenantPhone: string | null;
  studentFirstName: string;
  amountCents: number;
  monthlyCents: number;
  dueDay: number;
  dueDate: string;
  competence: string;
  expiresAt: string;
  pixPayload: string | null;
  automatic: boolean;
}

export async function loadPublicLink(token: string, now = new Date()): Promise<PublicLinkView | null> {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return null;
  const db = createAdminClient();
  const { data: link } = await db
    .from("enrollment_links")
    .select(
      "id, tenant_id, contract_id, purpose, expires_at, revoked_at, accepted_at, first_viewed_at, charge:charges(status, amount_cents, due_date, competence, pix_payload, method), contract:contracts(monthly_amount_cents, discount_type, discount_value, due_day, student:students(name), tenant:tenants(name, phone))",
    )
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!link || !link.charge || !link.contract) return null;

  if (!link.first_viewed_at) {
    await db.from("enrollment_links").update({ first_viewed_at: now.toISOString() }).eq("id", link.id).eq("tenant_id", link.tenant_id);
  }
  // Basta um aceite por contrato: o pai não precisa aceitar de novo todo mês.
  let accepted = Boolean(link.accepted_at);
  if (!accepted) {
    const { count } = await db
      .from("enrollment_links")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", link.tenant_id)
      .eq("contract_id", link.contract_id)
      .not("accepted_at", "is", null);
    accepted = (count ?? 0) > 0;
  }

  const ch = link.charge;
  const state: PublicLinkView["state"] =
    ch.status === "paga" ? "pago" : ch.status === "cancelada" ? "cancelado" : link.revoked_at || link.expires_at <= now.toISOString() ? "expirado" : "aberto";

  return {
    state,
    purpose: link.purpose,
    needsConsent: !accepted,
    tenantName: link.contract.tenant?.name ?? "",
    tenantPhone: link.contract.tenant?.phone ?? null,
    studentFirstName: (link.contract.student?.name ?? "").split(/\s+/)[0],
    amountCents: ch.amount_cents,
    monthlyCents: discountedAmount(link.contract.monthly_amount_cents, { type: link.contract.discount_type, value: link.contract.discount_value }),
    dueDay: link.contract.due_day,
    dueDate: ch.due_date,
    competence: ch.competence,
    expiresAt: link.expires_at,
    pixPayload: state === "aberto" ? ch.pix_payload : null,
    automatic: link.purpose === "adesao" && ch.method === "pix_automatico",
  };
}

/** Registra o aceite (base legal e ciência do uso dos dados). IP guardado só como hash. */
export async function acceptPublicLink(token: string, ip: string, now = new Date()): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return false;
  const { data, error } = await createAdminClient()
    .from("enrollment_links")
    .update({ accepted_at: now.toISOString(), accepted_ip_hash: sha256(`ip:${ip}`), consent_text_version: CONSENT_TEXT_VERSION })
    .eq("token_hash", sha256(token))
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString())
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}
