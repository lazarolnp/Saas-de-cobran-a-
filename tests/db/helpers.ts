/**
 * Utilitários para testar RLS direto no Postgres do Supabase local.
 * Simulamos o que o PostgREST faz: troca o papel para `authenticated` e
 * define as claims do JWT (auth.uid() lê request.jwt.claims.sub).
 */
import pg from "pg";
import { randomUUID } from "node:crypto";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function connect() {
  return new pg.Client({ connectionString: DATABASE_URL });
}

/** Cria um usuário no Auth (dispara o trigger que cria o tenant). */
export async function createAuthUser(db: pg.Client, label: string) {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@teste.local`;
  await db.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), $3, '{}', now(), now())`,
    [id, email, JSON.stringify({ name: `Usuário ${label}`, business_name: `Transporte ${label}` })],
  );
  const { rows } = await db.query<{ tenant_id: string }>("select tenant_id from public.users where id = $1", [id]);
  return { userId: id, tenantId: rows[0].tenant_id, email };
}

export async function deleteAuthUser(db: pg.Client, userId: string, tenantId: string) {
  await db.query("delete from public.tenants where id = $1", [tenantId]);
  await db.query("delete from auth.users where id = $1", [userId]);
}

/**
 * Executa `fn` dentro de uma transação como o usuário informado (ou anon).
 * A transação sofre rollback no final: nada fica gravado.
 */
export async function asUser<T>(db: pg.Client, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    if (userId) {
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
      await db.query("set local role authenticated");
    } else {
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
      await db.query("set local role anon");
    }
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

/** Transação como superusuário (sem RLS), desfeita no final. */
export async function inTx<T>(db: pg.Client, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

/**
 * Espera que a query falhe; devolve a mensagem de erro. Usa SAVEPOINT para
 * que a transação continue utilizável depois do erro.
 */
export async function expectError(db: pg.Client, sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint expect_error");
  try {
    await db.query(sql, params);
  } catch (err) {
    await db.query("rollback to savepoint expect_error");
    return (err as Error).message;
  }
  await db.query("release savepoint expect_error");
  throw new Error(`Era esperado um erro, mas funcionou: ${sql}`);
}
