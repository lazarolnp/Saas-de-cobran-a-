import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/supabase/server";
import { todaySP } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { StudentForm } from "./student-form";

export const metadata: Metadata = { title: "Cadastrar aluno" };

export default async function NovoAlunoPage() {
  const { supabase, tenant } = await requireTenant();
  if (!tenant) redirect("/entrar");
  const { data: routes } = await supabase.from("routes").select("id, name, shift").is("archived_at", null).order("name");

  const siblingHint =
    tenant.sibling_discount_type === "nenhum"
      ? null
      : `Se o responsável já tiver outro aluno, aplicamos o desconto de irmão: ${
          tenant.sibling_discount_type === "percentual" ? `${tenant.sibling_discount_value / 100}%` : formatBRL(tenant.sibling_discount_value)
        }.`;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/alunos" className="inline-flex min-h-12 items-center font-semibold text-brand-700">
        ← Alunos
      </Link>
      <h1 className="text-2xl font-bold">Cadastrar aluno</h1>
      <p className="text-gray-700">
        Tem muitos alunos?{" "}
        <Link href="/alunos/importar" className="font-semibold text-brand-700 underline">
          Importe por planilha
        </Link>
        .
      </p>
      <StudentForm routes={routes ?? []} today={todaySP()} siblingHint={siblingHint} />
    </div>
  );
}
