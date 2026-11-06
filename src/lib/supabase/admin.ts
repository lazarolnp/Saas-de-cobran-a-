import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Cliente com service_role: IGNORA o RLS.
 * Use somente em código de servidor que não tem usuário logado (webhooks,
 * cron, página pública de adesão) ou para gravar segredos. Toda consulta
 * feita com ele DEVE filtrar por tenant_id explicitamente.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
