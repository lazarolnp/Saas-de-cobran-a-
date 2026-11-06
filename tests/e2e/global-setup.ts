import pg from "pg";

/** Zera o limitador de tentativas para que rodadas seguidas de teste não se bloqueiem. */
export default async function globalSetup() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await db.connect();
  await db.query("delete from public.rate_limits");
  await db.end();
}
