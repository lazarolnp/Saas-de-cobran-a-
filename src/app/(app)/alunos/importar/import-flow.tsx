"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Badge, Button, ButtonLink, Card } from "@/components/ui";
import { errorReportCsv } from "@/domain/import";
import { confirmImport, previewImport, type PreviewState } from "../actions";

export function ImportFlow() {
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewImport, {});
  const [confirm, confirmAction, confirming] = useActionState<PreviewState, FormData>(confirmImport, {});
  const [showAll, setShowAll] = useState(false);

  if (confirm.done) {
    const d = confirm.done;
    return (
      <Card>
        <Alert tone="ok">
          <strong>
            {d.created} {d.created === 1 ? "aluno importado" : "alunos importados"}!
          </strong>
          {d.routesCreated > 0 && ` ${d.routesCreated} ${d.routesCreated === 1 ? "rota nova criada" : "rotas novas criadas"}.`}
          {d.siblingDiscounts > 0 && ` Desconto de irmão aplicado em ${d.siblingDiscounts}.`}
        </Alert>
        <ButtonLink href="/alunos" className="mt-4">
          Ver alunos
        </ButtonLink>
      </Card>
    );
  }

  const report = confirm.report ?? preview.report;
  const csv = confirm.csv ?? preview.csv;
  const rows = report?.rows ?? [];
  const visible = showAll ? rows : rows.filter((r) => r.errors.length).concat(rows.filter((r) => !r.errors.length)).slice(0, 30);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-lg font-bold">1. Baixe o modelo</h2>
        <p className="mt-1 text-gray-700">Uma linha por aluno. Abra no Excel ou Google Planilhas, preencha e salve como CSV.</p>
        <a href="/alunos/importar/modelo" className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full border-2 border-brand-600 text-lg font-semibold text-brand-700" download>
          Baixar modelo da planilha
        </a>
        <details className="mt-3">
          <summary className="flex min-h-12 cursor-pointer items-center font-semibold text-brand-700">Como preencher cada coluna</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-800">
            <li><strong>aluno, turno, responsavel, cpf, whatsapp, valor, vencimento</strong>: obrigatórias.</li>
            <li><strong>turno</strong>: manhã, tarde, integral ou noite.</li>
            <li><strong>valor</strong>: ex. 350,00. <strong>vencimento</strong>: o dia do mês, ex. 10.</li>
            <li><strong>rota</strong>: se não existir, a gente cria.</li>
            <li><strong>meses</strong>: 12, 10 (sem janeiro e julho) ou os meses, ex. “fev-jun, ago-dez”. Vazio = 12.</li>
            <li><strong>inicio</strong>: dia/mês/ano. Vazio = hoje.</li>
            <li><strong>desconto</strong>: “10%” ou “50,00”. Vazio = desconto de irmão automático, se configurado.</li>
          </ul>
        </details>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">2. Envie a planilha</h2>
        <form action={previewAction} className="mt-3 flex flex-col gap-3">
          <label htmlFor="file" className="sr-only">
            Arquivo CSV
          </label>
          <input id="file" name="file" type="file" accept=".csv,text/csv,.txt" required className="min-h-12 w-full rounded-xl border-2 border-dashed border-gray-300 bg-white p-3 text-base file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-semibold file:text-brand-700" />
          <Button type="submit" variant="dark" disabled={previewing}>
            {previewing ? "Conferindo..." : "Conferir planilha"}
          </Button>
        </form>
        {preview.error && <div className="mt-3"><Alert tone="danger">{preview.error}</Alert></div>}
      </Card>

      {report?.fatal && <Alert tone="danger">{report.fatal}</Alert>}

      {report?.ok && (
        <Card>
          <h2 className="text-lg font-bold">3. Confira e confirme</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="ok">{report.validCount} prontas</Badge>
            {report.errorCount > 0 && <Badge tone="danger">{report.errorCount} com problema</Badge>}
          </div>
          {report.errorCount > 0 && (
            <p className="mt-2 text-gray-700">
              As linhas com problema não serão importadas. Corrija na planilha e envie de novo, ou importe só as prontas agora.
            </p>
          )}

          <ul className="mt-4 flex flex-col gap-2" aria-label="Linhas da planilha">
            {visible.map((r) => (
              <li key={r.line} className={`rounded-xl border-2 p-3 ${r.errors.length ? "border-danger/40 bg-danger-bg" : "border-gray-200"}`}>
                <p className="font-semibold">
                  Linha {r.line}: {r.preview.studentName || "(sem nome)"}
                </p>
                <p className="text-sm text-gray-700">
                  {r.preview.guardianName} · {r.preview.amount ? `R$ ${r.preview.amount}` : "sem valor"}
                  {r.preview.route ? ` · ${r.preview.route}` : ""}
                </p>
                {r.errors.map((e) => (
                  <p key={e} className="mt-1 text-sm font-medium text-danger">
                    {e}
                  </p>
                ))}
                {!r.errors.length && r.warnings.map((w) => <p key={w} className="mt-1 text-sm text-gray-600">{w}</p>)}
              </li>
            ))}
          </ul>
          {rows.length > visible.length && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-2 min-h-12 w-full font-semibold text-brand-700">
              Ver todas as {rows.length} linhas
            </button>
          )}

          {report.errorCount > 0 && (
            <button
              type="button"
              onClick={() => download("erros-importacao.csv", errorReportCsv(report))}
              className="mt-3 min-h-12 w-full rounded-full border-2 border-gray-300 font-semibold"
            >
              Baixar relatório de erros
            </button>
          )}

          {confirm.error && <div className="mt-3"><Alert tone="danger">{confirm.error}</Alert></div>}

          {report.validCount > 0 && (
            <form action={confirmAction} className="mt-4">
              <input type="hidden" name="csv" value={csv ?? ""} />
              <Button type="submit" disabled={confirming}>
                {confirming ? "Importando..." : `Importar ${report.validCount} ${report.validCount === 1 ? "aluno" : "alunos"}`}
              </Button>
            </form>
          )}
        </Card>
      )}
      <Link href="/alunos/novo" className="inline-flex min-h-12 items-center justify-center font-semibold text-brand-700">
        Prefiro cadastrar um por um
      </Link>
    </div>
  );
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
