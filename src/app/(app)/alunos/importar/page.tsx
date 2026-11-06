import type { Metadata } from "next";
import Link from "next/link";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "Importar alunos" };

export default function ImportarPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/alunos" className="inline-flex min-h-12 items-center font-semibold text-brand-700">
        ← Alunos
      </Link>
      <h1 className="text-2xl font-bold">Importar alunos por planilha</h1>
      <ImportFlow />
    </div>
  );
}
