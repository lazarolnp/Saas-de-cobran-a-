/**
 * register_students: transação única, RLS e reaproveitamento do responsável.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { asUser, connect, createAuthUser, deleteAuthUser, expectError } from "./helpers";

let db: pg.Client;
let A: Awaited<ReturnType<typeof createAuthUser>>;
let B: Awaited<ReturnType<typeof createAuthUser>>;

const row = (over: Record<string, unknown> = {}) => ({
  student_name: "Ana Souza",
  shift: "manha",
  route_name: "Rota Manhã",
  guardian_name: "Marcos Souza",
  cpf_encrypted: "v1.a.b.c",
  cpf_hash: "hash-marcos",
  cpf_masked: "***.982.247-**",
  whatsapp: "5511987654321",
  monthly_amount_cents: 35000,
  due_day: 10,
  start_date: "2026-03-01",
  months_policy: "doze",
  discount_type: "nenhum",
  discount_value: 0,
  ...over,
});

beforeAll(async () => {
  db = connect();
  await db.connect();
  A = await createAuthUser(db, "reg-a");
  B = await createAuthUser(db, "reg-b");
});
afterAll(async () => {
  await deleteAuthUser(db, A.userId, A.tenantId);
  await deleteAuthUser(db, B.userId, B.tenantId);
  await db.end();
});

describe("register_students", () => {
  it("grava aluno, responsável, vínculo e contrato; cria a rota; irmão reaproveita o responsável", async () => {
    await asUser(db, A.userId, async () => {
      const { rows } = await db.query("select public.register_students($1::jsonb) as r", [
        JSON.stringify([
          row(),
          row({ student_name: "Bia Souza", discount_type: "percentual", discount_value: 1000 }),
          row({ student_name: "Caio Lima", cpf_hash: "hash-paula", guardian_name: "Paula", months_policy: "personalizada", custom_months: [2, 3, 4] }),
        ]),
      ]);
      expect(rows[0].r).toMatchObject({ created: 3, routes_created: 1, guardians_created: 2 });
      expect(rows[0].r.student_ids).toHaveLength(3);

      const g = await db.query("select count(*)::int as n from guardians");
      expect(g.rows[0].n).toBe(2);
      const c = await db.query("select monthly_amount_cents, discount_type, custom_months, tenant_id from contracts order by created_at");
      expect(c.rows).toHaveLength(3);
      expect(c.rows.every((x) => x.tenant_id === A.tenantId)).toBe(true);
      expect(c.rows.map((x) => x.custom_months)).toContainEqual([2, 3, 4]);
      const links = await db.query("select count(*)::int as n from student_guardians where is_primary_payer");
      expect(links.rows[0].n).toBe(3);
    });
  });

  it("é tudo ou nada: uma linha inválida desfaz as outras", async () => {
    await asUser(db, A.userId, async () => {
      const msg = await expectError(db, "select public.register_students($1::jsonb)", [
        JSON.stringify([row({ student_name: "Ok" }), row({ student_name: "Erro", monthly_amount_cents: 5 })]),
      ]);
      expect(msg).toMatch(/check constraint/);
      const s = await db.query("select count(*)::int as n from students where name in ('Ok', 'Erro')");
      expect(s.rows[0].n).toBe(0);
    });
  });

  it("não reaproveita responsável de outro tenant com o mesmo hash", async () => {
    await db.query(
      "insert into guardians (tenant_id, name, cpf_hash) values ($1, 'Responsável de B', 'hash-compartilhado')",
      [B.tenantId],
    );
    await asUser(db, A.userId, async () => {
      const { rows } = await db.query("select public.register_students($1::jsonb) as r", [JSON.stringify([row({ cpf_hash: "hash-compartilhado" })])]);
      expect(rows[0].r.guardians_created).toBe(1);
      const g = await db.query("select tenant_id from guardians where cpf_hash = 'hash-compartilhado'");
      expect(g.rows.map((x) => x.tenant_id)).toEqual([A.tenantId]);
    });
  });

  it("anon não executa", async () => {
    await asUser(db, null, async () => {
      expect(await expectError(db, "select public.register_students('[]'::jsonb)")).toMatch(/permission denied|sem tenant/);
    });
  });

  it("cliente pode mudar o desconto de irmão, mas não o plano", async () => {
    await asUser(db, A.userId, async () => {
      await db.query("update tenants set sibling_discount_type = 'percentual', sibling_discount_value = 1000");
      expect(await expectError(db, "update tenants set sibling_discount_type = 'percentual', sibling_discount_value = 20000")).toMatch(/check constraint/);
    });
  });
});
