"use server";

import { revalidatePath } from "next/cache";
import { parseDiscount } from "@/domain/registration";
import { requireTenant } from "@/lib/supabase/server";

export type SiblingState = { ok?: boolean; error?: string };

/** D6: desconto padrão de irmãos (a partir do 2º aluno do mesmo pagador). */
export async function saveSiblingDiscount(_prev: SiblingState, form: FormData): Promise<SiblingState> {
  const kind = String(form.get("kind") ?? "nenhum");
  const value = String(form.get("value") ?? "").trim();
  const parsed = kind === "nenhum" ? { type: "nenhum" as const, value: 0 } : parseDiscount(kind === "percentual" ? `${value}%` : value);
  if (!parsed || parsed === "invalido") return { error: kind === "percentual" ? "Use uma porcentagem entre 0 e 100." : "Use um valor como 30,00." };
  const { supabase, user } = await requireTenant();
  if (!user) return { error: "Sua sessão expirou." };
  const { error } = await supabase
    .from("tenants")
    .update({ sibling_discount_type: parsed.type, sibling_discount_value: parsed.value })
    .not("id", "is", null); // RLS limita ao próprio tenant
  if (error) return { error: "Não foi possível salvar." };
  await supabase.from("audit_log").insert({ actor_user_id: user.id, action: "tenant.desconto_irmao", metadata: { tipo: parsed.type, valor: parsed.value } });
  revalidatePath("/configuracoes");
  return { ok: true };
}
