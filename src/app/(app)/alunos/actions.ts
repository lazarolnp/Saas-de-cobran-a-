"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTenant } from "@/lib/supabase/server";
import { normalizeBrPhone } from "@/lib/br";
import { todaySP } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { validateRegistration, type FieldErrors, type RawRegistration } from "@/domain/registration";
import { buildImportReport, publicReport, type ImportReport } from "@/domain/import";
import { loadExistingContext, registerStudents, RegistrationError } from "@/services/registration";

export type StudentFormState = { error?: string; fieldErrors?: FieldErrors; values?: Record<string, string> };

/** Lê o formulário único e converte para o mesmo formato usado pela planilha. */
function rawFromForm(form: FormData): RawRegistration {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const monthsMode = get("monthsMode");
  const months = monthsMode === "dez" ? "10" : monthsMode === "personalizada" ? form.getAll("month").map(String).join(",") || "x" : "12";
  const kind = get("discountKind");
  const dv = get("discountValue");
  const discount = kind === "percentual" && dv ? `${dv}%` : kind === "valor" && dv ? dv : kind === "nenhum" ? "0" : "";
  return {
    studentName: get("studentName"),
    school: get("school"),
    grade: get("grade"),
    shift: get("shift"),
    route: get("route"),
    guardianName: get("guardianName"),
    cpf: get("cpf"),
    whatsapp: get("whatsapp"),
    email: get("email"),
    monthlyAmount: get("monthlyAmount"),
    dueDay: get("dueDay"),
    startDate: get("startDate"),
    months,
    discount,
    prorata: form.get("prorata") === "on" ? "sim" : "nao",
  };
}

export async function createStudent(_prev: StudentFormState, form: FormData): Promise<StudentFormState> {
  // Devolve o que foi digitado (menos o CPF completo) para o formulário não se apagar.
  const values = Object.fromEntries([...form.entries()].filter(([k]) => k !== "cpf" && !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const { supabase, user, tenant } = await requireTenant();
  if (!user || !tenant) return { error: "Sua sessão expirou. Entre de novo." };

  const v = validateRegistration(rawFromForm(form), todaySP());
  if (!v.ok) return { fieldErrors: v.errors, values };

  const ctx = await loadExistingContext(supabase);
  const existing = ctx.studentsByPayer.get(ctx.hashCpf(v.data.cpf));
  if (existing?.has(v.data.studentName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim())) {
    return { error: "Este aluno já está cadastrado com este responsável.", values };
  }

  let studentId: string;
  try {
    const res = await registerStudents(supabase, tenant, user.id, [v.data]);
    studentId = res.studentIds[0];
  } catch (err) {
    if (err instanceof RegistrationError) return { error: err.userMessage, values };
    logger.error("cadastrar_aluno_falhou", { err });
    return { error: "Não foi possível salvar agora. Tente de novo.", values };
  }
  revalidatePath("/alunos");
  redirect(`/alunos/${studentId}?novo=1`);
}

// --- Importação -------------------------------------------------------------

const MAX_BYTES = 1_000_000;

export type PreviewState = { report?: ImportReport; csv?: string; fileName?: string; error?: string; done?: { created: number; routesCreated: number; siblingDiscounts: number } };

/** Passo 1: valida a planilha e mostra a pré-visualização. Nada é gravado. */
export async function previewImport(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo da planilha." };
  if (file.size > MAX_BYTES) return { error: "Arquivo muito grande (máximo 1 MB)." };
  if (!/\.(csv|txt)$/i.test(file.name)) {
    return { error: "Use o arquivo em formato CSV. No Excel ou Google Planilhas: Arquivo → Salvar como / Fazer download → CSV." };
  }
  const csv = await file.text();
  const { supabase, user } = await requireTenant();
  if (!user) return { error: "Sua sessão expirou. Entre de novo." };
  const ctx = await loadExistingContext(supabase);
  return { report: publicReport(buildImportReport(csv, todaySP(), ctx)), csv, fileName: file.name };
}

/**
 * Passo 2: confirma. A planilha é validada DE NOVO no servidor (não confiamos
 * na pré-visualização) e só as linhas válidas são gravadas, todas juntas.
 */
export async function confirmImport(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const csv = z.string().max(MAX_BYTES * 2).safeParse(form.get("csv"));
  if (!csv.success || !csv.data) return { error: "Envie a planilha de novo." };
  const { supabase, user, tenant } = await requireTenant();
  if (!user || !tenant) return { error: "Sua sessão expirou. Entre de novo." };
  const ctx = await loadExistingContext(supabase);
  const report = buildImportReport(csv.data, todaySP(), ctx);
  const valid = report.rows.flatMap((r) => (r.data ? [r.data] : []));
  if (!valid.length) return { report: publicReport(report), csv: csv.data, error: "Nenhuma linha válida para importar." };
  try {
    const res = await registerStudents(supabase, tenant, user.id, valid);
    revalidatePath("/alunos");
    revalidatePath("/rotas");
    return { done: { created: res.created, routesCreated: res.routesCreated, siblingDiscounts: res.siblingDiscounts } };
  } catch (err) {
    if (err instanceof RegistrationError) return { report: publicReport(report), csv: csv.data, error: err.userMessage };
    logger.error("importar_falhou", { err });
    return { report: publicReport(report), csv: csv.data, error: "Não foi possível importar agora. Nada foi gravado. Tente de novo." };
  }
}

// --- Edição de dados de contato ---------------------------------------------

export type EditState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

const editSchema = z.object({
  studentId: z.uuid(),
  guardianId: z.uuid(),
  studentName: z.string().trim().min(2, "Escreva o nome do aluno.").max(120),
  school: z.string().trim().max(120),
  grade: z.string().trim().max(40),
  route: z.string().trim(),
  shift: z.enum(["manha", "tarde", "integral", "noite"], { error: "Escolha o turno." }),
  guardianName: z.string().trim().min(2, "Escreva o nome de quem paga.").max(120),
  whatsapp: z.string().trim().transform((v, ctx) => {
    const n = normalizeBrPhone(v);
    if (!n) ctx.addIssue({ code: "custom", message: "WhatsApp inválido. Use DDD + número." });
    return n ?? "";
  }),
  email: z.union([z.literal(""), z.email("E-mail inválido (ou deixe em branco).")]),
});

export async function updateStudent(_prev: EditState, form: FormData): Promise<EditState> {
  const parsed = editSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  const d = parsed.data;
  const { supabase, user } = await requireTenant();
  if (!user) return { error: "Sua sessão expirou. Entre de novo." };
  const [s, g] = await Promise.all([
    supabase
      .from("students")
      .update({ name: d.studentName, school: d.school || null, grade: d.grade || null, route_id: d.route || null, shift: d.shift })
      .eq("id", d.studentId),
    supabase.from("guardians").update({ name: d.guardianName, whatsapp: d.whatsapp, email: d.email || null }).eq("id", d.guardianId),
  ]);
  if (s.error || g.error) return { error: "Não foi possível salvar. Tente de novo." };
  await supabase.from("audit_log").insert({ actor_user_id: user.id, action: "aluno.editado", entity: "students", entity_id: d.studentId });
  revalidatePath(`/alunos/${d.studentId}`);
  revalidatePath("/alunos");
  return { ok: true };
}
