"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // Navegadores antigos: seleciona o texto para o usuário copiar.
          const el = document.getElementById("pix-copia-e-cola") as HTMLTextAreaElement | null;
          el?.select();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 4000);
      }}
      className="min-h-14 w-full rounded-full bg-brand-600 px-6 text-xl font-bold text-white active:bg-brand-800"
    >
      {copied ? "Código copiado! Agora cole no app do banco" : "Copiar código Pix"}
    </button>
  );
}
