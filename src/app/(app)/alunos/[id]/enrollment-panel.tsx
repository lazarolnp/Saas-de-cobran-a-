"use client";

import { useActionState, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { generateLinkAction, type LinkState } from "./billing-actions";

export function EnrollmentPanel({
  contractId,
  studentId,
  current,
  canGenerate,
  label,
}: {
  contractId: string;
  studentId: string;
  current: { url: string; whatsapp?: string; purpose: "adesao" | "cobranca" } | null;
  canGenerate: boolean;
  label: string;
}) {
  const [state, action, pending] = useActionState<LinkState, FormData>(generateLinkAction, {});
  const link = state.url ? { url: state.url, whatsapp: state.whatsapp, purpose: state.purpose ?? "adesao" } : current;
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {link && (
        <div className="flex flex-col gap-3 rounded-xl bg-brand-50 p-4">
          <p className="font-semibold text-brand-800">{link.purpose === "adesao" ? "Link de adesão pronto" : "Link de pagamento pronto"}</p>
          <p className="break-all text-sm text-gray-700">{link.url}</p>
          {link.whatsapp && (
            <a href={link.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#1f7a3a] px-6 text-lg font-semibold text-white">
              Enviar no WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(link.url);
              setCopied(true);
            }}
            className="min-h-12 rounded-full border-2 border-brand-600 font-semibold text-brand-700"
          >
            {copied ? "Link copiado" : "Copiar link"}
          </button>
        </div>
      )}
      {canGenerate && (
        <form action={action}>
          <input type="hidden" name="contractId" value={contractId} />
          <input type="hidden" name="studentId" value={studentId} />
          <Button type="submit" variant={link ? "secondary" : "primary"} disabled={pending}>
            {pending ? "Gerando..." : link ? "Gerar um link novo" : label}
          </Button>
        </form>
      )}
    </div>
  );
}
