"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { renderTemplate, whatsappLink } from "@/domain/templates";
import { BillingError, issueEnrollment } from "@/services/billing";

export type LinkState = { error?: string; url?: string; whatsapp?: string; message?: string; purpose?: "adesao" | "cobranca" };

export async function generateLinkAction(_prev: LinkState, form: FormData): Promise<LinkState> {
  const contractId = z.uuid().safeParse(form.get("contractId"));
  const studentId = String(form.get("studentId") ?? "");
  if (!contractId.success) return { error: "Contrato inválido." };
  const { supabase, user, tenant } = await requireTenant();
  if (!user || !tenant) return { error: "Sua sessão expirou. Entre de novo." };

  // RLS: confirma que o contrato é deste tenant antes de usar o service_role.
  const { data: c } = await supabase
    .from("contracts")
    .select("id, student:students(name), payer:guardians(name, whatsapp)")
    .eq("id", contractId.data)
    .maybeSingle();
  if (!c) return { error: "Contrato não encontrado." };

  try {
    const r = await issueEnrollment(tenant.id, c.id);
    const kind = r.purpose === "adesao" ? "boas_vindas" : "pre_vencimento";
    const { data: tpl } = await supabase.from("message_templates").select("body").eq("kind", kind).maybeSingle();
    const message = renderTemplate(tpl?.body ?? "{link}", {
      responsavel: c.payer?.name ?? "",
      aluno: c.student?.name ?? "",
      valorCents: r.amountCents,
      vencimento: r.dueDate,
      link: r.url,
    });
    await supabase.from("audit_log").insert({ actor_user_id: user.id, action: "link.gerado", entity: "contracts", entity_id: c.id, metadata: { tipo: r.purpose } });
    revalidatePath(`/alunos/${studentId}`);
    return { url: r.url, purpose: r.purpose, message, whatsapp: c.payer?.whatsapp ? whatsappLink(c.payer.whatsapp, message) : undefined };
  } catch (err) {
    if (err instanceof BillingError) return { error: err.userMessage };
    logger.error("gerar_link_falhou", { err });
    return { error: "Não foi possível gerar o link agora. Tente de novo." };
  }
}
