/**
 * Seed de DESENVOLVIMENTO: 1 tenant de exemplo, 2 rotas, 15 alunos e
 * cobranças em vários status, para testar todas as telas.
 *
 *   npm run db:seed
 *
 * Proteções contra dado fictício em produção:
 *  - recusa rodar com APP_ENV=production;
 *  - recusa rodar contra um Supabase que não seja local, a menos que
 *    SEED_ALLOW_REMOTE=1 (ex.: projeto de homologação);
 *  - o tenant é marcado com is_demo = true.
 *
 * É idempotente: apaga o tenant de exemplo anterior e recria.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { encrypt, hmac, randomToken, sha256 } from "../src/lib/crypto";
import { maskCpf } from "../src/lib/br";
import { todaySP } from "../src/lib/dates";

const DEMO_EMAIL = "demo@exemplo.com.br";
const DEMO_PASSWORD = "demo-senha-123";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const encKey = process.env.ENCRYPTION_KEY;

if (process.env.APP_ENV === "production") throw new Error("Seed bloqueado: APP_ENV=production.");
if (!url || !serviceKey || !encKey) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e ENCRYPTION_KEY (veja .env.example).");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url) && process.env.SEED_ALLOW_REMOTE !== "1") {
  throw new Error("Seed bloqueado: o Supabase não é local. Use SEED_ALLOW_REMOTE=1 só em homologação.");
}

const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function must<T>(res: { data: T; error: unknown }, what: string): NonNullable<T> {
  if (res.error || res.data === null || res.data === undefined) throw new Error(`${what}: ${JSON.stringify(res.error)}`);
  return res.data as NonNullable<T>;
}

/** Gera um CPF com dígitos verificadores válidos a partir de 9 dígitos (dado fictício). */
function fakeCpf(seed: number): string {
  const base = String(100000000 + seed * 7919).slice(0, 9).split("").map(Number);
  const dv = (digits: number[]) => {
    const sum = digits.reduce((acc, d, i) => acc + d * (digits.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join("");
}

/** Soma meses a "AAAA-MM-01". */
function addMonths(isoFirstDay: string, n: number): string {
  const [y, m] = isoFirstDay.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

function withDay(isoFirstDay: string, day: number): string {
  const [y, m] = isoFirstDay.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${isoFirstDay.slice(0, 8)}${String(Math.min(day, last)).padStart(2, "0")}`;
}

const FIRST_NAMES = ["Ana", "Bruno", "Carla", "Davi", "Elisa", "Felipe", "Gabriela", "Heitor", "Isadora", "João", "Laura", "Miguel", "Nina", "Otávio", "Pietra"];
const SURNAMES = ["Silva", "Souza", "Oliveira", "Santos", "Pereira", "Lima", "Costa", "Ribeiro", "Almeida", "Gomes", "Martins", "Rocha", "Barbosa", "Araújo", "Araújo"];
const PARENTS = ["Marcos", "Patrícia", "Ricardo", "Fernanda", "Paulo", "Juliana", "André", "Camila", "Rodrigo", "Aline", "Sérgio", "Tatiane", "Eduardo", "Renata", "Renata"];

async function main() {
  // 1) Limpa o demo anterior.
  const existing = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const old = existing.data.users.find((u) => u.email === DEMO_EMAIL);
  if (old) {
    const prof = await db.from("users").select("tenant_id").eq("id", old.id).maybeSingle();
    if (prof.data) await db.from("tenants").delete().eq("id", prof.data.tenant_id).eq("is_demo", true);
    await db.auth.admin.deleteUser(old.id);
  }

  // 2) Usuário + tenant (o trigger handle_new_auth_user cria tenant, users e templates).
  const created = await db.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Roberto Demo", business_name: "Transporte Escolar Tio Beto (DEMO)" },
  });
  if (created.error || !created.data.user) throw created.error;
  const userId = created.data.user.id;
  const tenantId = must(await db.from("users").select("tenant_id").eq("id", userId).single(), "tenant").tenant_id;

  must(
    await db
      .from("tenants")
      .update({
        is_demo: true,
        document: "11222333000181",
        phone: "11987650000",
        city: "Campinas",
        pix_automatico_eligibility: "elegivel",
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", tenantId)
      .select("id"),
    "tenant update",
  );

  // Conexão com o provedor simulado (sem chave real).
  must(
    await db
      .from("provider_connections")
      .insert({ tenant_id: tenantId, provider: "mock", environment: "sandbox", api_key_encrypted: encrypt("mock_demo", encKey!), api_key_hint: "demo", status: "ok", validated_at: new Date().toISOString() })
      .select("id"),
    "provider",
  );

  // 3) Rotas.
  const routes = must(
    await db
      .from("routes")
      .insert([
        { tenant_id: tenantId, name: "Rota Manhã: Centro", schools: ["EE Prof. Carlos Gomes", "Colégio Integral"], shift: "manha", vehicle: "Van Sprinter branca", capacity: 15 },
        { tenant_id: tenantId, name: "Rota Tarde: Jardins", schools: ["EMEF Jardim das Flores"], shift: "tarde", vehicle: "Kombi azul", capacity: 12 },
      ])
      .select("id, shift"),
    "rotas",
  );

  // 4) Alunos, responsáveis e contratos.
  const today = todaySP();
  const thisMonth = `${today.slice(0, 7)}-01`;
  // Distribuição de modos: 8 com Pix Automático, 4 Pix comum, 3 aguardando adesão.
  const modes: Database["public"]["Enums"]["billing_mode"][] = [
    ...Array(8).fill("pix_automatico"),
    ...Array(4).fill("pix_comum"),
    ...Array(3).fill("aguardando_adesao"),
  ];

  // Os alunos 13 e 14 são irmãos (mesmo responsável: Renata Araújo).
  let siblingGuardianId: string | null = null;

  for (let i = 0; i < 15; i++) {
    const route = routes[i % 2];
    const student = must(
      await db
        .from("students")
        .insert({ tenant_id: tenantId, name: `${FIRST_NAMES[i]} ${SURNAMES[i]}`, school: i % 2 ? "EMEF Jardim das Flores" : "EE Prof. Carlos Gomes", grade: `${(i % 9) + 1}º ano`, route_id: route.id, shift: route.shift })
        .select("id")
        .single(),
      "aluno",
    );

    let guardianId: string;
    if (i === 14 && siblingGuardianId) {
      guardianId = siblingGuardianId;
    } else {
      const cpf = fakeCpf(i + 1);
      const g = must(
        await db
          .from("guardians")
          .insert({
            tenant_id: tenantId,
            name: `${PARENTS[i]} ${SURNAMES[i]}`,
            cpf_encrypted: encrypt(cpf, encKey!),
            cpf_hash: hmac(cpf, encKey!),
            cpf_masked: maskCpf(cpf),
            whatsapp: `55119${String(80000000 + i * 1111).padStart(8, "0")}`,
            email: i % 3 === 0 ? `responsavel${i + 1}@exemplo.com.br` : null,
          })
          .select("id")
          .single(),
        "responsável",
      );
      guardianId = g.id;
      if (i === 13) siblingGuardianId = guardianId;
    }

    must(await db.from("student_guardians").insert({ tenant_id: tenantId, student_id: student.id, guardian_id: guardianId, is_primary_payer: true, relationship: i % 2 ? "mãe" : "pai" }).select("id"), "vínculo");

    const isSibling = i === 14;
    const mode = modes[i];
    const amount = 35000 + (i % 4) * 2500; // R$ 350,00 a R$ 425,00
    const dueDay = i % 3 === 0 ? 10 : 5;
    const contract = must(
      await db
        .from("contracts")
        .insert({
          tenant_id: tenantId,
          student_id: student.id,
          payer_guardian_id: guardianId,
          monthly_amount_cents: amount,
          due_day: dueDay,
          start_date: addMonths(thisMonth, -3),
          months_policy: i % 5 === 0 ? "dez" : "doze",
          discount_type: isSibling ? "percentual" : "nenhum",
          discount_value: isSibling ? 1000 : 0, // 10% de desconto para o irmão
          billing_mode: mode,
        })
        .select("id")
        .single(),
      "contrato",
    );

    // Autorização do Pix Automático.
    let authorizationId: string | null = null;
    if (mode !== "pix_comum") {
      const auth = must(
        await db
          .from("authorizations")
          .insert({
            tenant_id: tenantId,
            contract_id: contract.id,
            provider: "mock",
            provider_authorization_id: `mock_auth_${i + 1}`,
            status: mode === "pix_automatico" ? "ativa" : "pendente",
            min_limit_cents: amount,
            max_amount_cents: mode === "pix_automatico" ? Math.round(amount * 1.1) : null,
            starts_on: addMonths(thisMonth, -3),
            activated_at: mode === "pix_automatico" ? new Date(Date.now() - 80 * 86_400_000).toISOString() : null,
          })
          .select("id")
          .single(),
        "autorização",
      );
      authorizationId = auth.id;
    }

    if (mode === "aguardando_adesao") {
      // Link de adesão de exemplo (o token em claro só é mostrado no console).
      const token = randomToken();
      must(
        await db
          .from("enrollment_links")
          .insert({ tenant_id: tenantId, contract_id: contract.id, authorization_id: authorizationId, token_hash: sha256(token), expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() })
          .select("id"),
        "link",
      );
      console.log(`  link de adesão (${FIRST_NAMES[i]}): /adesao/${token}`);
      continue; // sem cobranças ainda: a 1ª é a da adesão
    }

    // 5) Cobranças: 2 meses atrás, mês passado, mês atual e próximo mês.
    const discount = isSibling ? Math.round(amount * 0.1) : 0;
    const finalAmount = amount - discount;
    const method: Database["public"]["Enums"]["charge_method"] = mode === "pix_automatico" ? "pix_automatico" : "pix_comum";
    const rows: Database["public"]["Tables"]["charges"]["Insert"][] = [];
    for (const offset of [-2, -1, 0, 1]) {
      const competence = addMonths(thisMonth, offset);
      const month = Number(competence.slice(5, 7));
      if (i % 5 === 0 && (month === 1 || month === 7)) continue; // política de 10 meses
      const due = withDay(competence, dueDay);
      const base = {
        tenant_id: tenantId,
        contract_id: contract.id,
        authorization_id: method === "pix_automatico" ? authorizationId : null,
        competence,
        amount_cents: finalAmount,
        discount_cents: discount,
        due_date: due,
        method,
        provider: "mock" as const,
        provider_charge_id: `mock_pay_${i + 1}_${competence}`,
        pix_payload: `00020126580014br.gov.bcb.pix0136demo-${i + 1}-${competence}5204000053039865802BR6304ABCD`,
        is_enrollment: offset === -2,
      };

      let status: Database["public"]["Enums"]["charge_status"];
      let extra: Partial<Database["public"]["Tables"]["charges"]["Insert"]> = {};
      const past = due < today;
      if (offset < 0 || (offset === 0 && past && i % 4 !== 1)) {
        // Meses anteriores pagos, exceto alguns atrasados de Pix comum.
        if (offset === -1 && mode === "pix_comum" && i % 2 === 0) status = "atrasada";
        else {
          status = "paga";
          extra = { paid_at: `${due}T12:00:00-03:00`, paid_amount_cents: finalAmount };
        }
      } else if (offset === 0 && past) {
        status = "atrasada";
      } else if (offset === 0) {
        status = "enviada";
      } else {
        status = "agendada";
      }
      rows.push({ ...base, status, ...extra });
    }

    // Casos especiais para a tela "Precisa de revisão" e cancelamento.
    if (i === 9 && rows[1]) {
      rows[1] = { ...rows[1], status: "paga", paid_at: `${rows[1].due_date}T15:00:00-03:00`, paid_amount_cents: (rows[1].amount_cents ?? 0) - 5000, review_reason: "Valor pago (R$ 50,00 a menos) diferente do valor da cobrança." };
    }
    if (i === 11 && rows[rows.length - 1]) rows[rows.length - 1] = { ...rows[rows.length - 1], status: "cancelada" };

    must(await db.from("charges").insert(rows).select("id"), "cobranças");
  }

  // 6) Alguns lembretes pendentes para hoje.
  const open = must(
    await db.from("charges").select("id, status").eq("tenant_id", tenantId).in("status", ["atrasada", "enviada"]).limit(5),
    "abertas",
  );
  if (open.length) {
    must(
      await db
        .from("message_log")
        .insert(open.map((c) => ({ tenant_id: tenantId, charge_id: c.id, template_kind: c.status === "atrasada" ? ("atraso_3" as const) : ("pre_vencimento" as const), body: "(texto gerado na etapa 7)", scheduled_for: today })))
        .select("id"),
      "lembretes",
    );
  }

  console.log("\nSeed concluído.");
  console.log(`  login: ${DEMO_EMAIL}`);
  console.log(`  senha: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error("Seed falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
