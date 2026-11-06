"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconSettings } from "@/components/icons";

/** Menu inferior fixo, ao alcance do polegar. Itens novos entram nas próximas etapas. */
const ITEMS = [
  { href: "/inicio", label: "Início", Icon: IconHome },
  { href: "/configuracoes", label: "Ajustes", Icon: IconSettings },
];

export function AppNav() {
  const path = usePathname();
  return (
    <nav aria-label="Menu principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-3xl">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-semibold ${active ? "text-brand-600" : "text-gray-600"}`}
              >
                <Icon aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
