import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskCpf } from "@/lib/br";
import { encrypt, hmac } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { Database, Json } from "@/lib/supabase/database.types";
import { applySiblingDiscount, type Discount, type Registration } from "@/domain/registration";
import type { ExistingContext } from "@/domain/import";

type Db = SupabaseClient<Database>;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const hashCpf = (cpf: string) => hmac(cpf, serverEnv().ENCRYPTION_KEY);

/**
 * Contratos abertos por pagador (hash do CPF), para detectar duplicidade e
 * aplicar o desconto de irmãos. Usa o cliente do usuário: RLS restringe ao tenant.
 */
export async function loadExistingContext(db: Db): Promise<ExistingContext & { openByPayer: Map<string, number> }> {
  const { data, error } = await db
    .from("contracts")
    .select("student:students(name), payer:guardians(cpf_hash)")
    .neq("status", "encerrado")
    .limit(5000);
  if (error) throw new Error(`contratos: ${error.code}`);
  const studentsByPayer = new Map<string, Set<string>>();
  const openByPayer = new Map<string, number>();
  for (const row of data ?? []) {
    const hash = row.payer?.cpf_hash;
    if (!hash || !row.student) continue;
    if (!studentsByPayer.has(hash)) studentsByPayer.set(hash, new Set());
    studentsByPayer.get(hash)!.add(norm(row.student.name));
    openByPayer.set(hash, (openByPayer.get(hash) ?? 0) + 1);
  }
  return { studentsByPayer, openByPayer, hashCpf };
}

export interface RegisterResult {
  created: number;
  routesCreated: number;
  guardiansCreated: number;
  siblingDiscounts: number;
  studentIds: string[];
}

/**
 * Grava os cadastros numa única transação (função register_students).
 * Se qualquer linha falhar no banco, nada é gravado.
 */
export async function registerStudents(db: Db, tenant: { id: string; sibling_discount_type: Discount["type"]; sibling_discount_value: number }, userId: string, regs: Registration[]): Promise<RegisterResult> {
  if (!regs.length) return { created: 0, routesCreated: 0, guardiansCreated: 0, siblingDiscounts: 0, studentIds: [] };
  const key = serverEnv().ENCRYPTION_KEY;
  const ctx = await loadExistingContext(db);
  const tenantSibling: Discount = { type: tenant.sibling_discount_type, value: tenant.sibling_discount_value };

  const openCount = new Map(ctx.openByPayer);
  let siblingDiscounts = 0;
  const rows = regs.map((r) => {
    const cpfHash = hmac(r.cpf, key);
    const { discount, auto } = applySiblingDiscount(r.discount, openCount.get(cpfHash) ?? 0, tenantSibling);
    if (auto) siblingDiscounts++;
    openCount.set(cpfHash, (openCount.get(cpfHash) ?? 0) + 1);
    return {
      student_name: r.studentName,
      school: r.school,
      grade: r.grade,
      shift: r.shift,
      route_id: r.routeId,
      route_name: r.routeName,
      guardian_name: r.guardianName,
      cpf_encrypted: encrypt(r.cpf, key),
      cpf_hash: cpfHash,
      cpf_masked: maskCpf(r.cpf),
      whatsapp: r.whatsapp,
      email: r.email,
      monthly_amount_cents: r.monthlyAmountCents,
      due_day: r.dueDay,
      start_date: r.startDate,
      months_policy: r.monthsPolicy,
      custom_months: r.customMonths,
      discount_type: discount.type,
      discount_value: discount.value,
      prorata_first_month: r.prorataFirstMonth,
    };
  });

  const { data, error } = await db.rpc("register_students", { p_rows: rows as unknown as Json });
  if (error) {
    logger.error("register_students_falhou", { tenantId: tenant.id, code: error.code, count: rows.length });
    throw new RegistrationError(error.code === "23505" ? "Um destes alunos já tem contrato aberto." : "Não foi possível salvar agora. Tente de novo.");
  }
  const res = data as { created: number; routes_created: number; guardians_created: number; student_ids: string[] };

  await db.from("audit_log").insert({
    actor_user_id: userId,
    action: regs.length > 1 ? "alunos.importados" : "aluno.cadastrado",
    entity: "students",
    metadata: { quantidade: res.created, rotas_novas: res.routes_created, descontos_irmao: siblingDiscounts },
  });

  return { created: res.created, routesCreated: res.routes_created, guardiansCreated: res.guardians_created, siblingDiscounts, studentIds: res.student_ids };
}

export class RegistrationError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}
