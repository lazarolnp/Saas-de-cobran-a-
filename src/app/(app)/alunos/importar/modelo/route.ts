import { templateCsv } from "@/domain/import";

/** Modelo da planilha (CSV com ";", abre direto no Excel). */
export function GET() {
  return new Response(templateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modelo-alunos.csv"',
      "Cache-Control": "no-store",
    },
  });
}
