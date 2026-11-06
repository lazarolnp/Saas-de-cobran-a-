/**
 * Prova de isolamento multi-tenant (RLS) e das travas do esquema.
 * Requer Supabase local: npm run db:start && npm run db:reset
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { asUser, connect, createAuthUser, deleteAuthUser, expectError, inTx } from "./helpers";

let db: pg.Client;
let A: Awaited<ReturnType<typeof createAuthUser>>;
let B: Awaited<ReturnType<typeof createAuthUser>>;
const ids: Record<string, string> = {};

async function one<T = Record<string, string>>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  return rows[0] as T;
}

/** Cria um conjunto mínimo de dados para um tenant (como superusuário). */
async function seedTenant(tenantId: string, prefix: string) {
  const route = await one(`insert into routes (tenant_id, name, shift) values ($1, $2, 'manha') returning id`, [tenantId, `${prefix} rota`]);
  const student = await one(`insert into students (tenant_id, name, shift, route_id) values ($1, $2, 'manha', $3) returning id`, [tenantId, `${prefix} aluno`, route.id]);
  const guardian = await one(`insert into guardians (tenant_id, name, cpf_encrypted, cpf_masked) values ($1, $2, 'v1.x.y.z', '***.111.222-**') returning id`, [tenantId, `${prefix} resp`]);
  const contract = await one(
    `insert into contracts (tenant_id, student_id, payer_guardian_id, monthly_amount_cents, due_day, start_date) values ($1, $2, $3, 40000, 10, '2026-02-01') returning id`,
    [tenantId, student.id, guardian.id],
  );
  const charge = await one(
    `insert into charges (tenant_id, contract_id, competence, amount_cents, due_date, method) values ($1, $2, '2026-03-01', 40000, '2026-03-10', 'pix_comum') returning id`,
    [tenantId, contract.id],
  );
  await db.query(
    `insert into provider_connections (tenant_id, provider, api_key_encrypted, api_key_hint) values ($1, 'asaas', 'v1.segredo.cifrado.aqui', 'ab12')`,
    [tenantId],
  );
  await db.query(`insert into webhook_events (tenant_id, provider, event_id, event_type, payload) values ($1, 'asaas', $2, 'PAYMENT_RECEIVED', '{}')`, [tenantId, `evt_${prefix}_${tenantId}`]);
  Object.assign(ids, {
    [`${prefix}_route`]: route.id,
    [`${prefix}_student`]: student.id,
    [`${prefix}_guardian`]: guardian.id,
    [`${prefix}_contract`]: contract.id,
    [`${prefix}_charge`]: charge.id,
  });
}

beforeAll(async () => {
  db = connect();
  await db.connect();
  A = await createAuthUser(db, "a");
  B = await createAuthUser(db, "b");
  await seedTenant(A.tenantId, "a");
  await seedTenant(B.tenantId, "b");
});

afterAll(async () => {
  if (A) await deleteAuthUser(db, A.userId, A.tenantId);
  if (B) await deleteAuthUser(db, B.userId, B.tenantId);
  await db.end();
});

describe("cadastro cria o tenant", () => {
  it("trigger cria tenant, usuário e os 7 templates padrão", async () => {
    const t = await one<{ name: string; plan: string; trial_days: number }>(
      `select name, plan, round(extract(epoch from trial_ends_at - created_at) / 86400)::int as trial_days from tenants where id = $1`,
      [A.tenantId],
    );
    expect(t).toMatchObject({ name: "Transporte a", plan: "trial", trial_days: 14 });
    const { rows } = await db.query("select kind from message_templates where tenant_id = $1", [A.tenantId]);
    expect(rows).toHaveLength(7);
  });
});

describe("estrutura de segurança", () => {
  it("todas as tabelas do schema public têm RLS ligado e forçado", async () => {
    const { rows } = await db.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)`,
    );
    expect(rows).toEqual([]);
  });

  it("toda tabela de negócio tem tenant_id, created_at e updated_at", async () => {
    const { rows } = await db.query(
      `select t.tablename from pg_tables t where t.schemaname = 'public' and t.tablename not in ('tenants', 'rate_limits')
       and (select count(*) from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.tablename
            and c.column_name in ('tenant_id', 'created_at', 'updated_at')) < 3`,
    );
    expect(rows).toEqual([]);
  });
});

describe("isolamento entre tenants", () => {
  const tables = ["routes", "students", "guardians", "contracts", "charges", "message_templates", "provider_connections"];

  for (const table of tables) {
    it(`A só enxerga as próprias linhas de ${table}`, async () => {
      await asUser(db, A.userId, async () => {
        const col = table === "provider_connections" ? "id, tenant_id" : "tenant_id";
        const { rows } = await db.query(`select ${col} from ${table}`);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.tenant_id === A.tenantId)).toBe(true);
      });
    });
  }

  it("A não vê o tenant nem o usuário de B", async () => {
    await asUser(db, A.userId, async () => {
      const t = await db.query("select id from tenants");
      expect(t.rows.map((r) => r.id)).toEqual([A.tenantId]);
      const u = await db.query("select id from users");
      expect(u.rows.map((r) => r.id)).toEqual([A.userId]);
    });
  });

  it("A não altera nem apaga dados de B (0 linhas afetadas)", async () => {
    await asUser(db, A.userId, async () => {
      const upd = await db.query("update students set name = 'hackeado' where id = $1", [ids.b_student]);
      expect(upd.rowCount).toBe(0);
      const del = await db.query("delete from routes where id = $1", [ids.b_route]);
      expect(del.rowCount).toBe(0);
    });
    const still = await one<{ name: string }>("select name from students where id = $1", [ids.b_student]);
    expect(still.name).toBe("b aluno");
  });

  it("A não consegue inserir linha com tenant_id de B", async () => {
    await asUser(db, A.userId, async () => {
      const msg = await expectError(db, "insert into routes (tenant_id, name, shift) values ($1, 'x', 'manha')", [B.tenantId]);
      expect(msg).toMatch(/row-level security/);
    });
  });

  it("tenant_id é preenchido automaticamente com o tenant do usuário", async () => {
    await asUser(db, A.userId, async () => {
      const r = await db.query("insert into routes (name, shift) values ('nova', 'tarde') returning tenant_id");
      expect(r.rows[0].tenant_id).toBe(A.tenantId);
    });
  });

  it("A não consegue ligar seu contrato a um aluno de B, mesmo sabendo o UUID", async () => {
    // Aluno de B ainda sem contrato, para o teste exercitar só a chave estrangeira.
    const bNew = await one(`insert into students (tenant_id, name, shift) values ($1, 'b sem contrato', 'manha') returning id`, [B.tenantId]);
    await asUser(db, A.userId, async () => {
      const msg = await expectError(
        db,
        "insert into contracts (student_id, payer_guardian_id, monthly_amount_cents, due_day, start_date) values ($1, $2, 40000, 5, '2026-03-01')",
        [bNew.id, ids.a_guardian],
      );
      expect(msg).toMatch(/foreign key/);
    });
  });

  it("A não move um aluno seu para uma rota de B", async () => {
    await asUser(db, A.userId, async () => {
      const msg = await expectError(db, "update students set route_id = $1 where id = $2", [ids.b_route, ids.a_student]);
      expect(msg).toMatch(/foreign key/);
    });
  });
});

describe("dados sensíveis e tabelas controladas pelo servidor", () => {
  it("cliente não lê a chave criptografada do provedor", async () => {
    await asUser(db, A.userId, async () => {
      const ok = await db.query("select api_key_hint from provider_connections");
      expect(ok.rows[0].api_key_hint).toBe("ab12");
      const msg = await expectError(db, "select api_key_encrypted from provider_connections");
      expect(msg).toMatch(/permission denied/);
    });
  });

  it("cliente não grava conexão de provedor (só o servidor)", async () => {
    await asUser(db, A.userId, async () => {
      const msg = await expectError(db, "update provider_connections set api_key_hint = 'x'");
      expect(msg).toMatch(/permission denied/);
    });
  });

  it("cliente não cria nem altera cobranças diretamente", async () => {
    await asUser(db, A.userId, async () => {
      const ins = await expectError(
        db,
        "insert into charges (contract_id, competence, amount_cents, due_date, method) values ($1, '2026-04-01', 1, '2026-04-10', 'pix_comum')",
        [ids.a_contract],
      );
      expect(ins).toMatch(/permission denied/);
      const upd = await expectError(db, "update charges set status = 'paga', paid_at = now() where id = $1", [ids.a_charge]);
      expect(upd).toMatch(/permission denied/);
    });
  });

  it("cliente não muda o próprio plano nem a elegibilidade", async () => {
    await asUser(db, A.userId, async () => {
      const msg = await expectError(db, "update tenants set plan = 'ate_100'");
      expect(msg).toMatch(/permission denied/);
      const ok = await db.query("update tenants set city = 'Campinas' returning city");
      expect(ok.rows[0].city).toBe("Campinas");
    });
  });

  it("cliente não acessa webhook_events nem rate_limits", async () => {
    await asUser(db, A.userId, async () => {
      expect(await expectError(db, "select * from webhook_events")).toMatch(/permission denied/);
      expect(await expectError(db, "select * from rate_limits")).toMatch(/permission denied/);
    });
  });

  it("audit_log: insere como si mesmo, mas não apaga", async () => {
    await asUser(db, A.userId, async () => {
      await db.query("insert into audit_log (actor_user_id, action) values ($1, 'teste')", [A.userId]);
      expect(await expectError(db, "insert into audit_log (actor_user_id, action) values ($1, 'falso')", [B.userId])).toMatch(/row-level security/);
      expect(await expectError(db, "delete from audit_log")).toMatch(/permission denied/);
    });
  });

  it("anon não lê nenhuma tabela", async () => {
    await asUser(db, null, async () => {
      for (const t of ["tenants", "students", "guardians", "charges", "enrollment_links"]) {
        expect(await expectError(db, `select 1 from ${t}`)).toMatch(/permission denied/);
      }
    });
  });
});

describe("travas de integridade", () => {
  it("não existe duas cobranças na mesma competência do mesmo contrato", async () => {
    const msg = await inTx(db, () => expectError(
      db,
      `insert into charges (tenant_id, contract_id, competence, amount_cents, due_date, method) values ($1, $2, '2026-03-01', 40000, '2026-03-10', 'pix_comum')`,
      [A.tenantId, ids.a_contract],
    ));
    expect(msg).toMatch(/duplicate key/);
  });

  it("webhook com o mesmo id de evento não duplica (base da idempotência)", async () => {
    const r = await db.query(
      `insert into webhook_events (tenant_id, provider, event_id, event_type, payload) values ($1, 'asaas', $2, 'PAYMENT_RECEIVED', '{}') on conflict (provider, event_id) do nothing`,
      [A.tenantId, `evt_a_${A.tenantId}`],
    );
    expect(r.rowCount).toBe(0);
  });

  it("cobrança paga exige data de pagamento e competência é sempre dia 1", async () => inTx(db, async () => {
    expect(await expectError(db, "update charges set status = 'paga' where id = $1", [ids.a_charge])).toMatch(/check constraint/);
    expect(
      await expectError(
        db,
        `insert into charges (tenant_id, contract_id, competence, amount_cents, due_date, method) values ($1, $2, '2026-05-15', 1, '2026-05-20', 'pix_comum')`,
        [A.tenantId, ids.a_contract],
      ),
    ).toMatch(/check constraint/);
  }));

  it("limite de tentativas bloqueia depois do máximo", async () => {
    const key = `teste-${Date.now()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { rows } = await db.query("select public.hit_rate_limit($1, 3, 60) as ok", [key]);
      results.push(rows[0].ok);
    }
    expect(results).toEqual([true, true, true, false]);
    await db.query("delete from rate_limits where key = $1", [key]);
  });
});
