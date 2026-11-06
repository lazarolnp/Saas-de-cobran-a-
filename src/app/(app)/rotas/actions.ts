"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/supabase/server";

export type RouteFormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; attempt?: number };

const schema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(1, "Dê um nome para a rota.").max(80, "Nome muito longo."),
  shift: z.enum(["manha", "tarde", "integral", "noite"], { error: "Escolha o turno." }),
  schools: z.string().trim().max(500).optional(),
  vehicle: z.string().trim().max(80).optional(),
  capacity: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100), "Lugares entre 1 e 100 (ou deixe em branco)."),
});

export async function saveRoute(prev: RouteFormState, form: FormData): Promise<RouteFormState> {
  const attempt = (prev.attempt ?? 0) + 1;
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, attempt };
  }
  const { supabase, user } = await requireTenant();
  if (!user) return { error: "Sua sessão expirou. Entre de novo.", attempt };
  const d = parsed.data;
  const row = {
    name: d.name,
    shift: d.shift,
    schools: (d.schools ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
    vehicle: d.vehicle || null,
    capacity: d.capacity ? Number(d.capacity) : null,
  };
  const { error } = d.id ? await supabase.from("routes").update(row).eq("id", d.id) : await supabase.from("routes").insert(row);
  if (error) return { error: "Não foi possível salvar a rota. Tente de novo.", attempt };
  revalidatePath("/rotas");
  return { ok: true, attempt };
}

export async function archiveRoute(form: FormData) {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const { supabase } = await requireTenant();
  // Arquivar não apaga: os alunos continuam com a rota no histórico.
  await supabase.from("routes").update({ archived_at: new Date().toISOString() }).eq("id", id.data);
  revalidatePath("/rotas");
}
