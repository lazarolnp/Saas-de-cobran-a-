import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/supabase/server";
import { PRODUCT_NAME } from "@/lib/product";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, tenant } = await requireTenant();
  if (!user || !tenant) redirect("/entrar");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/inicio" className="min-w-0">
            <span className="block truncate text-lg font-bold text-brand-700">{tenant.name}</span>
            <span className="block text-xs text-gray-600">{PRODUCT_NAME}</span>
          </Link>
          <form action={signOut}>
            <button type="submit" className="min-h-12 rounded-xl px-3 text-base font-semibold text-brand-700 hover:bg-brand-50">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
