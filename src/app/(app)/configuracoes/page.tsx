import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, Card, IconTile } from "@/components/ui";
import { IconCard, IconChevron, IconPix } from "@/components/icons";
import { formatBRL } from "@/lib/money";
import { SAAS_PLANS, TRIAL_DAYS } from "@/lib/product";
import { daysBetween, todaySP } from "@/lib/dates";
import { requireTenant } from "@/lib/supabase/server";
import { SiblingDiscountForm } from "./sibling-form";

export const metadata: Metadata = { title: "Ajustes" };

export default async function ConfiguracoesPage() {
  const { supabase, tenant } = await requireTenant();
  if (!tenant) redirect("/entrar");
  const { data: conn } = await supabase.from("provider_connections").select("status").maybeSingle();
  const trialLeft = Math.max(0, daysBetween(todaySP(), todaySP(new Date(tenant.trial_ends_at))));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      <MenuCard
        href="/configuracoes/recebimento"
        icon={<IconPix />}
        title="Onde você recebe"
        subtitle="Conta Asaas e Pix Automático"
        badge={conn ? <Badge tone={conn.status === "ok" ? "ok" : "danger"}>{conn.status === "ok" ? "Conectada" : "Com problema"}</Badge> : <Badge tone="warn">Falta conectar</Badge>}
      />

      <Card>
        <h2 className="text-lg font-bold">Desconto para irmãos</h2>
        <p className="text-gray-700">Aplicado sozinho a partir do 2º aluno do mesmo responsável. O 1º paga o valor cheio.</p>
        <SiblingDiscountForm
          type={tenant.sibling_discount_type}
          value={tenant.sibling_discount_type === "percentual" ? String(tenant.sibling_discount_value / 100).replace(".", ",") : tenant.sibling_discount_type === "valor" ? (tenant.sibling_discount_value / 100).toFixed(2).replace(".", ",") : ""}
        />
      </Card>

      {/* 7.8: plano do SaaS (placeholder; cobrança manual no MVP) */}
      <Card>
        <div className="flex items-start gap-3">
          <IconTile>
            <IconCard />
          </IconTile>
          <div>
            <h2 className="text-lg font-bold">Seu plano</h2>
            <p className="text-gray-700">
              {tenant.subscription_status === "trial"
                ? `Teste grátis de ${TRIAL_DAYS} dias: ${trialLeft > 0 ? `faltam ${trialLeft} ${trialLeft === 1 ? "dia" : "dias"}` : "terminou"}.`
                : "Plano ativo."}
            </p>
          </div>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {SAAS_PLANS.map((p) => (
            <li key={p.id} className={`rounded-2xl border-2 p-4 ${tenant.plan === p.id ? "border-brand-600 bg-brand-50" : "border-gray-200"}`}>
              <p className="font-semibold text-gray-800">{p.label}</p>
              <p className="mt-1 text-2xl font-bold text-brand-600">
                {formatBRL(p.priceCents)}
                <span className="text-base font-medium text-gray-600"> /mês</span>
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-gray-600">Para assinar, fale com a gente. O pagamento do plano ainda é feito por fora do app.</p>
      </Card>
    </div>
  );
}

function MenuCard({ href, icon, title, subtitle, badge }: { href: string; icon: ReactNode; title: string; subtitle: string; badge?: ReactNode }) {
  return (
    <Link href={href} className="block rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 hover:ring-brand-600">
      <div className="flex items-center gap-3">
        <IconTile>{icon}</IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{title}</p>
          <p className="text-gray-700">{subtitle}</p>
          {badge && <div className="mt-2">{badge}</div>}
        </div>
        <IconChevron className="text-gray-400" aria-hidden />
      </div>
    </Link>
  );
}
