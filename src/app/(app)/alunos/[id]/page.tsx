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
import { EnrollmentPanel } from "./enrollment-panel";
import { liveLinkForCharge } from "@/services/billing";
import { renderTemplate, whatsappLink } from "@/domain/templates";
import { CHARGE_STATUS_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Aluno" };

export default async function AlunoPage({ params, searchParams }: PageProps<"/alunos/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, tenant } = await requireTenant();
  if (!tenant) notFound();

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

  // Cobranças do contrato (RLS) e o link vigente da cobrança em aberto.
  const [{ data: charges }, { data: conn }] = await Promise.all([
    c ? supabase.from("charges").select("id, competence, amount_cents, due_date, status, method, is_enrollment, review_reason, last_send_error").eq("contract_id", c.id).order("competence", { ascending: false }).limit(24) : Promise.resolve({ data: [] }),
    supabase.from("provider_connections").select("status").maybeSingle(),
  ]);
  const open = (charges ?? []).filter((x) => x.status === "enviada" || x.status === "atrasada").at(-1);
  const live = open ? await liveLinkForCharge(tenant.id, open.id) : null;
  let currentLink: { url: string; whatsapp?: string; purpose: "adesao" | "cobranca" } | null = null;
  if (live && open) {
    const kind = live.purpose === "adesao" ? "boas_vindas" : open.status === "atrasada" ? "atraso_1" : "pre_vencimento";
    const { data: tpl } = await supabase.from("message_templates").select("body").eq("kind", kind).maybeSingle();
    const text = renderTemplate(tpl?.body ?? "{link}", { responsavel: g?.name ?? "", aluno: s.name, valorCents: open.amount_cents, vencimento: open.due_date, link: live.url });
    currentLink = { url: live.url, purpose: live.purpose, whatsapp: g?.whatsapp ? whatsappLink(g.whatsapp, text) : undefined };
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/alunos" className="inline-flex min-h-12 items-center font-semibold text-brand-700">
        ← Alunos
      </Link>
      {sp.novo && <Alert tone="ok">Aluno cadastrado! Agora gere o link e mande para o responsável pelo WhatsApp.</Alert>}
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

      {c && c.status === "ativo" && (
        <Card>
          <h2 className="text-lg font-bold">{c.billing_mode === "pix_automatico" ? "Pix Automático ativo" : c.billing_mode === "aguardando_adesao" ? "Convite para o Pix Automático" : "Pagamento por Pix"}</h2>
          <p className="mt-1 text-gray-700">
            {c.billing_mode === "pix_automatico"
              ? "O responsável autorizou: todo mês o valor cai sozinho."
              : c.billing_mode === "aguardando_adesao"
                ? "Mande o link: o responsável paga o 1º mês e autoriza os próximos de uma vez só."
                : tenant.pix_automatico_eligibility === "nao_elegivel"
                  ? "Todo mês o sistema gera o Pix e você manda o lembrete pelo WhatsApp."
                  : "O responsável ainda não autorizou o Pix Automático. Você pode mandar um novo convite: ele paga a cobrança em aberto e autoriza os próximos meses."}
          </p>
          <div className="mt-4">
            {conn ? (
              <EnrollmentPanel
                contractId={c.id}
                studentId={s.id}
                current={currentLink}
                canGenerate={c.billing_mode !== "pix_automatico"}
                label={c.billing_mode === "aguardando_adesao" || tenant.pix_automatico_eligibility !== "nao_elegivel" ? "Gerar link de adesão" : "Gerar link de pagamento"}
              />
            ) : (
              <Alert tone="warn">Conecte sua conta de recebimento em Ajustes para gerar o link.</Alert>
            )}
          </div>
        </Card>
      )}

      {(charges ?? []).length > 0 && (
        <Card>
          <h2 className="text-lg font-bold">Cobranças</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {(charges ?? []).map((ch) => (
              <li key={ch.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">
                    {ch.competence.slice(5, 7)}/{ch.competence.slice(0, 4)} · {formatBRL(ch.amount_cents)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Vence {formatDateBR(ch.due_date)} · {ch.method === "pix_automatico" ? "Pix Automático" : "Pix comum"}
                  </p>
                  {ch.last_send_error && ch.status === "agendada" && <p className="text-sm text-danger">{ch.last_send_error}</p>}
                  {ch.review_reason && <p className="text-sm text-warn">Precisa de revisão: {ch.review_reason}</p>}
                </div>
                <Badge tone={ch.status === "paga" ? "ok" : ch.status === "atrasada" ? "danger" : ch.status === "cancelada" ? "neutral" : "info"}>{CHARGE_STATUS_LABEL[ch.status]}</Badge>
              </li>
            ))}
          </ul>
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
