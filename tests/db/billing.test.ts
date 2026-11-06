/**
 * Serviço de cobranças contra o banco local, com o MockProvider.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { encrypt, hmac } from "@/lib/crypto";
import { mockSimulator, resetMockProvider } from "@/providers/mock/mock-provider";
import { connectProvider } from "@/services/provider-connection";
import { issueEnrollment, liveLinkForCharge, runDailyBilling } from "@/services/billing";
import { connect, createAuthUser, deleteAuthUser } from "./helpers";

let db: pg.Client;
const users: Awaited<ReturnType<typeof createAuthUser>>[] = [];
const KEY = () => process.env.ENCRYPTION_KEY!;

async function setupTenant(label: string, eligible: "elegivel" | "nao_elegivel") {
  const u = await createAuthUser(db, label);
  users.push(u);
  await db.query("update tenants set pix_automatico_eligibility = $2 where id = $1", [u.tenantId, eligible]);
  const r = await connectProvider({ tenantId: u.tenantId, userId: u.userId, userEmail: u.email }, { provider: "mock", apiKey: "mock_teste" });
  expect(r.ok).toBe(true);
  return u;
}

async function addContract(tenantId: string, over: Record<string, unknown> = {}) {
  const cpf = "52998224725";
  const g = await db.query(
    "insert into guardians (tenant_id, name, cpf_encrypted, cpf_hash, cpf_masked, whatsapp) values ($1, 'Marcos Souza', $2, $3, '***.982.247-**', '5511987654321') returning id",
    [tenantId, encrypt(cpf, KEY()), hmac(`${cpf}${Math.random()}`, KEY())],
  );
  const s = await db.query("insert into students (tenant_id, name, shift) values ($1, 'Ana Souza', 'manha') returning id", [tenantId]);
  const c = await db.query(
    `insert into contracts (tenant_id, student_id, payer_guardian_id, monthly_amount_cents, due_day, start_date, months_policy, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, billing_mode`,
    [tenantId, s.rows[0].id, g.rows[0].id, over.amount ?? 40000, over.dueDay ?? 10, over.start ?? "2026-03-01", over.policy ?? "doze", over.createdAt ?? "2026-03-01T12:00:00Z"],
  );
  return c.rows[0] as { id: string; billing_mode: string };
}

const charges = async (contractId: string) =>
  (await db.query("select competence::text, status, method, amount_cents, due_date::text, provider_charge_id, is_enrollment, pix_payload from charges where contract_id = $1 order by competence", [contractId])).rows;

beforeAll(async () => {
  db = connect();
  await db.connect();
});
afterAll(async () => {
  for (const u of users) await deleteAuthUser(db, u.userId, u.tenantId);
  await db.end();
});
beforeEach(() => resetMockProvider());

describe("adesão", () => {
  it("tenant elegível: autorização com QR imediato paga o 1º mês; link expira em 7 dias", async () => {
    const u = await setupTenant("bill-eleg", "elegivel");
    const c = await addContract(u.tenantId);
    expect(c.billing_mode).toBe("aguardando_adesao");
    const now = new Date("2026-03-02T13:00:00Z");
    const r = await issueEnrollment(u.tenantId, c.id, now);
    expect(r).toMatchObject({ purpose: "adesao", amountCents: 40000, competence: "2026-03-01" });
    expect(r.url).toMatch(/\/p\/[A-Za-z0-9_-]{43}$/);

    const [ch] = await charges(c.id);
    expect(ch).toMatchObject({ competence: "2026-03-01", method: "pix_automatico", is_enrollment: true, status: "enviada", due_date: "2026-03-09" });
    expect(ch.pix_payload).toMatch(/^PIX-SIMULADO/);
    const a = await db.query("select status, min_limit_cents, provider_authorization_id from authorizations where contract_id = $1", [c.id]);
    expect(a.rows[0]).toMatchObject({ status: "pendente", min_limit_cents: 40000 });

    // Mock recebeu: modo MANUAL implícito, QR expira em 7 dias.
    const mockAuth = mockSimulator._state().authorizations.get(a.rows[0].provider_authorization_id)!;
    expect(new Date(mockAuth.qrExpiresAt!).getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);

    // Link guardado só como hash, mas pode ser remontado para os lembretes.
    const link = await db.query("select token_hash, token_encrypted, purpose from enrollment_links where contract_id = $1", [c.id]);
    expect(link.rows[0].purpose).toBe("adesao");
    expect(link.rows[0].token_encrypted).not.toContain(r.url.split("/p/")[1]);
  });

  it("gerar um novo link substitui o anterior (sem duas autorizações vivas)", async () => {
    const u = await setupTenant("bill-novo", "elegivel");
    const c = await addContract(u.tenantId);
    const first = await issueEnrollment(u.tenantId, c.id, new Date("2026-03-02T13:00:00Z"));
    const second = await issueEnrollment(u.tenantId, c.id, new Date("2026-03-03T13:00:00Z"));
    expect(second.url).not.toBe(first.url);
    const a = await db.query("select status from authorizations where contract_id = $1 order by attempt", [c.id]);
    expect(a.rows.map((x) => x.status)).toEqual(["cancelada", "pendente"]);
    expect(await charges(c.id)).toHaveLength(1);
  });

  it("tenant sem Pix Automático: contrato já nasce em Pix comum e o link é de pagamento", async () => {
    const u = await setupTenant("bill-comum", "nao_elegivel");
    const c = await addContract(u.tenantId);
    expect(c.billing_mode).toBe("pix_comum");
    const r = await issueEnrollment(u.tenantId, c.id, new Date("2026-03-02T13:00:00Z"));
    expect(r.purpose).toBe("cobranca");
    const [ch] = await charges(c.id);
    expect(ch).toMatchObject({ method: "pix_comum", status: "enviada", due_date: "2026-03-10", is_enrollment: false });
    expect(ch.provider_charge_id).toMatch(/^pay_mock_/);
  });
});

describe("rotina diária", () => {
  it("gera por competência, envia, e é idempotente (rodar 2x não duplica)", async () => {
    const u = await setupTenant("bill-daily", "nao_elegivel");
    const c = await addContract(u.tenantId, { start: "2026-03-01", policy: "dez" });
    await issueEnrollment(u.tenantId, c.id, new Date("2026-03-02T13:00:00Z")); // março

    // 30/03: abril (venc. 10/04) entra na janela de 8 dias úteis (Sexta Santa 03/04 conta como feriado).
    const r1 = await runDailyBilling(u.tenantId, new Date("2026-03-30T12:00:00Z"));
    expect(r1).toMatchObject({ generated: 1, sent: 1, failed: 0 });
    const r2 = await runDailyBilling(u.tenantId, new Date("2026-03-30T12:00:00Z"));
    expect(r2).toMatchObject({ generated: 0, sent: 0 });
    expect((await charges(c.id)).map((x) => x.competence)).toEqual(["2026-03-01", "2026-04-01"]);

    // Julho não tem cobrança (10 meses): em 25/07, gera junho e agosto? Só o que já entrou na janela.
    await runDailyBilling(u.tenantId, new Date("2026-07-31T12:00:00Z"));
    const list = (await charges(c.id)).map((x) => x.competence);
    expect(list).not.toContain("2026-07-01");
    expect(list).toContain("2026-08-01");

    // O link de cada Pix comum fica disponível para os lembretes.
    const ch = await db.query("select id from charges where contract_id = $1 and competence = '2026-04-01'", [c.id]);
    expect((await liveLinkForCharge(u.tenantId, ch.rows[0].id, new Date("2026-04-01T12:00:00Z")))?.purpose).toBe("cobranca");
  });

  it("marca como atrasada no dia seguinte ao vencimento", async () => {
    const u = await setupTenant("bill-late", "nao_elegivel");
    const c = await addContract(u.tenantId);
    await issueEnrollment(u.tenantId, c.id, new Date("2026-03-02T13:00:00Z")); // vence 10/03
    expect((await runDailyBilling(u.tenantId, new Date("2026-03-10T15:00:00Z"))).overdue).toBe(0);
    expect((await runDailyBilling(u.tenantId, new Date("2026-03-11T15:00:00Z"))).overdue).toBe(1);
    expect((await charges(c.id))[0].status).toBe("atrasada");
  });

  it("D8: adesão não paga em 7 dias vira Pix comum e o 1º mês sai como Pix comum", async () => {
    const u = await setupTenant("bill-d8", "elegivel");
    const c = await addContract(u.tenantId);
    await issueEnrollment(u.tenantId, c.id, new Date("2026-03-02T13:00:00Z"));
    expect((await runDailyBilling(u.tenantId, new Date("2026-03-08T12:00:00Z"))).fallbacks).toBe(0);
    const r = await runDailyBilling(u.tenantId, new Date("2026-03-09T14:00:00Z"));
    expect(r.fallbacks).toBe(1);
    expect(r.sent).toBe(1);
    const contract = await db.query("select billing_mode from contracts where id = $1", [c.id]);
    expect(contract.rows[0].billing_mode).toBe("pix_comum");
    const [ch] = await charges(c.id);
    expect(ch).toMatchObject({ competence: "2026-03-01", method: "pix_comum", status: "enviada", is_enrollment: false, due_date: "2026-03-10" });
    expect(ch.provider_charge_id).toMatch(/^pay_mock_/);
    const a = await db.query("select status from authorizations where contract_id = $1", [c.id]);
    expect(a.rows[0].status).toBe("recusada");

    // Depois o pai ainda pode autorizar: novo link converte a cobrança em aberto.
    const again = await issueEnrollment(u.tenantId, c.id, new Date("2026-03-09T15:00:00Z"));
    expect(again.purpose).toBe("adesao");
    expect(await charges(c.id)).toHaveLength(1);
    expect((await charges(c.id))[0].method).toBe("pix_automatico");
  });

  it("D8 sem link: contrato aguardando há mais de 7 dias passa para Pix comum", async () => {
    const u = await setupTenant("bill-d8b", "elegivel");
    const c = await addContract(u.tenantId, { createdAt: "2026-03-01T12:00:00Z" });
    const r = await runDailyBilling(u.tenantId, new Date("2026-03-09T12:00:00Z"));
    expect(r).toMatchObject({ fallbacks: 1, generated: 1, sent: 1 });
    expect((await charges(c.id))[0]).toMatchObject({ method: "pix_comum", competence: "2026-03-01" });
  });

  it("com autorização ativa, as próximas cobranças vão para o Pix Automático", async () => {
    const u = await setupTenant("bill-auto", "elegivel");
    const c = await addContract(u.tenantId);
    await issueEnrollment(u.tenantId, c.id, new Date("2026-03-02T13:00:00Z"));
    // Simula a ativação (na etapa 6 isso vem pelo webhook).
    const a = await db.query("select id, provider_authorization_id from authorizations where contract_id = $1", [c.id]);
    mockSimulator.enroll(a.rows[0].provider_authorization_id, "ativada");
    await db.query("update authorizations set status = 'ativa', activated_at = now() where id = $1", [a.rows[0].id]);
    await db.query("update contracts set billing_mode = 'pix_automatico' where id = $1", [c.id]);
    await db.query("update charges set status = 'paga', paid_at = now() where contract_id = $1", [c.id]);

    await runDailyBilling(u.tenantId, new Date("2026-03-30T12:00:00Z"));
    const april = (await charges(c.id)).find((x) => x.competence === "2026-04-01")!;
    expect(april).toMatchObject({ method: "pix_automatico", status: "enviada", pix_payload: null });

    // Autorização recusada pelo provedor na hora de vincular: cai para Pix comum na hora.
    const ghost = await addContract(u.tenantId, { start: "2026-04-01", createdAt: "2026-03-20T12:00:00Z" });
    await db.query("update contracts set billing_mode = 'pix_automatico' where id = $1", [ghost.id]);
    await db.query("insert into authorizations (tenant_id, contract_id, provider, provider_authorization_id, status) values ($1, $2, 'mock', 'mock_auth_cancelada_no_banco', 'ativa')", [u.tenantId, ghost.id]);
    await runDailyBilling(u.tenantId, new Date("2026-03-30T12:00:00Z"));
    expect((await charges(ghost.id))[0]).toMatchObject({ competence: "2026-04-01", method: "pix_comum", status: "enviada" });

    // Gerada tarde demais (menos de 2 dias úteis): sai como Pix comum.
    const late = await addContract(u.tenantId, { start: "2026-04-01", createdAt: "2026-04-08T12:00:00Z" });
    await db.query("update contracts set billing_mode = 'pix_automatico' where id = $1", [late.id]);
    await db.query("insert into authorizations (tenant_id, contract_id, provider, provider_authorization_id, status) values ($1, $2, 'mock', 'mock_auth_tarde', 'ativa')", [u.tenantId, late.id]);
    await runDailyBilling(u.tenantId, new Date("2026-04-09T12:00:00Z"));
    expect((await charges(late.id))[0]).toMatchObject({ competence: "2026-04-01", method: "pix_comum", due_date: "2026-04-10" });
  });
});
