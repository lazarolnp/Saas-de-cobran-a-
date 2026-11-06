import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (antigo middleware): renova a sessão do Supabase e faz a checagem
 * OTIMISTA de login. A autorização de verdade acontece no servidor
 * (requireTenant) e no banco (RLS).
 */
const PUBLIC_PREFIXES = ["/entrar", "/cadastrar", "/p", "/legal", "/api/webhooks", "/api/cron", "/auth"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  // Webhooks e cron não usam sessão de usuário; não gaste uma chamada ao Auth.
  if (path.startsWith("/api/webhooks") || path.startsWith("/api/cron")) return response;

  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);

  if (!loggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (loggedIn && (path === "/entrar" || path === "/cadastrar")) {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
