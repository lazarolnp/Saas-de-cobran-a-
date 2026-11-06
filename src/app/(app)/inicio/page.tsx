import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { requireTenant } from "@/lib/supabase/server";
import { daysBetween, todaySP } from "@/lib/dates";

export const metadata: Metadata = { title: "Início" };

/**
 * Tela inicial (versão da etapa 2): mostra o teste grátis e os números da
 * conta lidos com RLS. Os cards financeiros e a lista "O que fazer hoje"
 * entram na etapa 7.
 */
export default async function InicioPage() {
  const { supabase, user, tenant } = await requireTenant();
  if (!user || !tenant) redirect("/entrar");

  const [routes, students, contracts] = await Promise.all([
    supabase.from("routes").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "ativo"),
    supabase.from("contracts").select("id", { count: "exact", head: true }).neq("status", "encerrado"),
  ]);

  const trialDaysLeft = Math.max(0, daysBetween(todaySP(), todaySP(new Date(tenant.trial_ends_at))));
  const firstName = user.name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Olá{firstName ? `, ${firstName}` : ""}!</h1>

      {tenant.subscription_status === "trial" && (
        <Alert tone={trialDaysLeft <= 3 ? "warn" : "info"}>
          {trialDaysLeft > 0
            ? `Seu teste grátis termina em ${trialDaysLeft} ${trialDaysLeft === 1 ? "dia" : "dias"}.`
            : "Seu teste grátis terminou. Fale com a gente para continuar usando."}
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Rotas" value={routes.count ?? 0} />
        <Stat label="Alunos ativos" value={students.count ?? 0} />
        <Stat label="Contratos" value={contracts.count ?? 0} />
      </div>

      {(students.count ?? 0) === 0 && (
        <Card>
          <h2 className="text-lg font-bold">Vamos começar?</h2>
          <p className="mt-1 text-gray-700">
            Em poucos minutos você conecta sua conta de recebimento, cria sua rota e cadastra os alunos.
          </p>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="text-center">
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-700">{label}</p>
    </Card>
  );
}
