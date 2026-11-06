import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { BrandMark } from "@/components/brand";
import { requireTenant } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, tenant } = await requireTenant();
  if (!user || !tenant) redirect("/entrar");

  return (
    <div className="flex min-h-full flex-1 flex-col pb-20">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/inicio" className="flex min-h-12 min-w-0 items-center" aria-label="Ir para o início">
            <BrandMark />
          </Link>
          <form action={signOut}>
            <button type="submit" className="min-h-12 rounded-full px-4 text-base font-semibold text-brand-700 hover:bg-brand-50">
              Sair
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl px-4 pt-3">
        <p className="truncate text-sm font-medium text-gray-600">{tenant.name}</p>
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-3">{children}</main>
      <AppNav />
    </div>
  );
}
