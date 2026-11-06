import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { IconChevron } from "@/components/icons";
import { BILLING_MODE_LABEL, SHIFT_LABEL, STUDENT_STATUS_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { discountedAmount } from "@/domain/registration";
import { requireTenant } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Alunos" };

const PAGE_SIZE = 20;
const STATUS_TONE = { ativo: "ok", pausado: "warn", encerrado: "neutral" } as const;
const MODE_TONE = { pix_automatico: "ok", pix_comum: "info", aguardando_adesao: "warn" } as const;

export default async function AlunosPage({ searchParams }: PageProps<"/alunos">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const rota = one("rota");
  const turno = one("turno");
  const situacao = one("situacao") || "ativo";
  const q = one("q").slice(0, 60);
  const page = Math.max(1, Number(one("pagina")) || 1);

  const { supabase } = await requireTenant();
  let query = supabase
    .from("students")
    .select(
      "id, name, shift, status, route:routes(name), contracts(monthly_amount_cents, discount_type, discount_value, billing_mode, status), student_guardians(is_primary_payer, guardian:guardians(name))",
      { count: "exact" },
    )
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (rota === "sem") query = query.is("route_id", null);
  else if (/^[0-9a-f-]{36}$/.test(rota)) query = query.eq("route_id", rota);
  if (turno in SHIFT_LABEL) query = query.eq("shift", turno as keyof typeof SHIFT_LABEL);
  if (situacao in STUDENT_STATUS_LABEL) query = query.eq("status", situacao as keyof typeof STUDENT_STATUS_LABEL);
  if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, "")}%`);

  const [{ data: students, count }, { data: routes }] = await Promise.all([
    query,
    supabase.from("routes").select("id, name").is("archived_at", null).order("name"),
  ]);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const u = new URLSearchParams({ ...(rota && { rota }), ...(turno && { turno }), situacao, ...(q && { q }), pagina: String(p) });
    return `/alunos?${u}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Alunos</h1>
        <span className="text-gray-600">{total} no total</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ButtonLink href="/alunos/novo">Cadastrar</ButtonLink>
        <ButtonLink href="/alunos/importar" variant="secondary">
          Importar
        </ButtonLink>
      </div>

      <form className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 ring-1 ring-gray-200" role="search">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="font-medium">Buscar pelo nome</span>
          <input name="q" defaultValue={q} className="min-h-12 rounded-xl border-2 border-gray-300 px-4 text-lg" />
        </label>
        <Select label="Rota" name="rota" value={rota} options={[["", "Todas"], ["sem", "Sem rota"], ...(routes ?? []).map((r) => [r.id, r.name] as [string, string])]} />
        <Select label="Turno" name="turno" value={turno} options={[["", "Todos"], ...Object.entries(SHIFT_LABEL)]} />
        <Select label="Situação" name="situacao" value={situacao} options={[...Object.entries(STUDENT_STATUS_LABEL), ["todos", "Todos"]]} />
        <div className="flex items-end">
          <button type="submit" className="min-h-12 w-full rounded-full bg-ink font-semibold text-white">
            Filtrar
          </button>
        </div>
      </form>

      {total === 0 ? (
        <Card>
          <p className="text-lg font-semibold">{q || rota || turno ? "Nenhum aluno com esses filtros." : "Nenhum aluno cadastrado ainda."}</p>
          <p className="mt-1 text-gray-700">
            {q || rota || turno ? "Tente mudar os filtros." : "Cadastre um por um ou importe todos de uma vez pela planilha."}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {(students ?? []).map((s) => {
            const c = s.contracts.find((x) => x.status !== "encerrado") ?? s.contracts[0];
            const payer = s.student_guardians.find((g) => g.is_primary_payer)?.guardian?.name;
            return (
              <li key={s.id}>
                <Link href={`/alunos/${s.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-brand-600">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{s.name}</p>
                    <p className="truncate text-gray-700">
                      {s.route?.name ?? "Sem rota"} · {SHIFT_LABEL[s.shift]}
                      {payer ? ` · ${payer}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={STATUS_TONE[s.status]}>{STUDENT_STATUS_LABEL[s.status]}</Badge>
                      {c && <Badge tone={MODE_TONE[c.billing_mode]}>{BILLING_MODE_LABEL[c.billing_mode]}</Badge>}
                      {c && (
                        <Badge tone="neutral">
                          {formatBRL(discountedAmount(c.monthly_amount_cents, { type: c.discount_type, value: c.discount_value }))}/mês
                        </Badge>
                      )}
                    </div>
                  </div>
                  <IconChevron className="shrink-0 text-gray-400" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Páginas" className="grid grid-cols-3 items-center gap-2">
          {page > 1 ? <ButtonLink href={qs(page - 1)} variant="secondary">Anterior</ButtonLink> : <span />}
          <span className="text-center text-gray-700">
            {page} de {pages}
          </span>
          {page < pages ? <ButtonLink href={qs(page + 1)} variant="secondary">Próxima</ButtonLink> : <span />}
        </nav>
      )}
    </div>
  );
}

function Select({ label, name, value, options }: { label: string; name: string; value: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      <select name={name} defaultValue={value} className="min-h-12 w-full rounded-xl border-2 border-gray-300 bg-white px-3 text-lg">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
