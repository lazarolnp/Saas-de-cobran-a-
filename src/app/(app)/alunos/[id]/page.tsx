import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card } from "@/components/ui";
import { maskPhone } from "@/lib/br";
import { formatDateBR } from "@/lib/dates";
import { BILLING_MODE_LABEL, MONTH_SHORT, MONTHS_POLICY_LABEL, SHIFT_LABEL, STUDENT_STATUS_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { discountedAmount } from "@/domain/registration";
import { requireTenant } from "@/lib/supabase/server";
import { EditStudent } from "./edit-form";

export const metadata: Metadata = { title: "Aluno" };

export default async function AlunoPage({ params, searchParams }: PageProps<"/alunos/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireTenant();

  const [{ data: s }, { data: routes }] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, name, school, grade, shift, status, route_id, route:routes(name), student_guardians(is_primary_payer, guardian:guardians(id, name, cpf_masked, whatsapp, email)), contracts(id, monthly_amount_cents, due_day, start_date, months_policy, custom_months, discount_type, discount_value, prorata_first_month, billing_mode, status)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("routes").select("id, name").is("archived_at", null).order("name"),
  ]);
  if (!s) notFound(); // RLS: aluno de outro tenant simplesmente não existe aqui.

  const g = s.student_guardians.find((x) => x.is_primary_payer)?.guardian;
  const c = s.contracts.find((x) => x.status !== "encerrado") ?? s.contracts[0];
  const discount = c ? { type: c.discount_type, value: c.discount_value } : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/alunos" className="inline-flex min-h-12 items-center font-semibold text-brand-700">
        ← Alunos
      </Link>
      {sp.novo && <Alert tone="ok">Aluno cadastrado! As cobranças e o link para o responsável autorizar o Pix chegam na próxima etapa.</Alert>}
      <div>
        <h1 className="text-2xl font-bold">{s.name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone={s.status === "ativo" ? "ok" : s.status === "pausado" ? "warn" : "neutral"}>{STUDENT_STATUS_LABEL[s.status]}</Badge>
          {c && <Badge>{BILLING_MODE_LABEL[c.billing_mode]}</Badge>}
        </div>
      </div>

      <Card>
        <h2 className="text-lg font-bold">Transporte</h2>
        <Dl
          items={[
            ["Rota", s.route?.name ?? "Sem rota"],
            ["Turno", SHIFT_LABEL[s.shift]],
            ["Escola", s.school ?? "—"],
            ["Série", s.grade ?? "—"],
          ]}
        />
      </Card>

      {g && (
        <Card>
          <h2 className="text-lg font-bold">Quem paga</h2>
          <Dl
            items={[
              ["Nome", g.name],
              ["CPF", g.cpf_masked ?? "—"],
              ["WhatsApp", g.whatsapp ? maskPhone(g.whatsapp) : "—"],
              ["E-mail", g.email ?? "—"],
            ]}
          />
        </Card>
      )}

      {c && (
        <Card>
          <h2 className="text-lg font-bold">Mensalidade</h2>
          <Dl
            items={[
              ["Valor", discount && discount.type !== "nenhum" ? `${formatBRL(discountedAmount(c.monthly_amount_cents, discount))} (de ${formatBRL(c.monthly_amount_cents)})` : formatBRL(c.monthly_amount_cents)],
              ["Desconto", c.discount_type === "nenhum" ? "Nenhum" : c.discount_type === "percentual" ? `${c.discount_value / 100}%` : formatBRL(c.discount_value)],
              ["Vencimento", `Todo dia ${c.due_day}`],
              ["Início", formatDateBR(c.start_date)],
              ["Meses", c.months_policy === "personalizada" ? (c.custom_months ?? []).map((m) => MONTH_SHORT[m - 1]).join(", ") : MONTHS_POLICY_LABEL[c.months_policy]],
              ["1º mês proporcional", c.prorata_first_month ? "Sim" : "Não"],
            ]}
          />
        </Card>
      )}

      {g && (
        <EditStudent
          routes={routes ?? []}
          initial={{
            studentId: s.id,
            guardianId: g.id,
            studentName: s.name,
            school: s.school ?? "",
            grade: s.grade ?? "",
            route: s.route_id ?? "",
            shift: s.shift,
            guardianName: g.name,
            whatsapp: g.whatsapp ?? "",
            email: g.email ?? "",
          }}
        />
      )}
    </div>
  );
}

function Dl({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-2 divide-y divide-gray-100">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2">
          <dt className="text-gray-600">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
