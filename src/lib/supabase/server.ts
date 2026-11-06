import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Cliente Supabase com a sessão do usuário (RLS ativo).
 * Crie um por requisição; não reutilize entre requisições.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Chamado a partir de um Server Component: o proxy já renova a sessão.
          }
        },
      },
    },
  );
}

/**
 * Exige usuário logado e devolve o usuário + tenant. Use em Server Components,
 * Server Actions e Route Handlers da área logada.
 */
export async function requireTenant() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return { supabase, user: null, tenant: null } as const;

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, email, tenant:tenants(*)")
    .eq("id", userId)
    .single();

  return { supabase, user: profile ? { id: profile.id, name: profile.name, email: profile.email } : null, tenant: profile?.tenant ?? null } as const;
}
