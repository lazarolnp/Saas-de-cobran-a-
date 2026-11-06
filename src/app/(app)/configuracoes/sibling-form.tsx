"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { saveSiblingDiscount, type SiblingState } from "./actions";

export function SiblingDiscountForm({ type, value }: { type: "nenhum" | "valor" | "percentual"; value: string }) {
  const [state, action, pending] = useActionState<SiblingState, FormData>(saveSiblingDiscount, {});
  const [kind, setKind] = useState(type);
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      {state.ok && <Alert tone="ok">Desconto salvo. Vale para os próximos cadastros.</Alert>}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Tipo de desconto para irmãos" className="min-h-12 rounded-xl border-2 border-gray-300 bg-white px-4 text-lg">
        <option value="nenhum">Sem desconto para irmãos</option>
        <option value="percentual">Porcentagem (%)</option>
        <option value="valor">Valor em reais (R$)</option>
      </select>
      {kind !== "nenhum" && <Field label={kind === "percentual" ? "Quantos %?" : "Quantos reais por mês?"} name="value" inputMode="decimal" defaultValue={value} />}
      <Button type="submit" variant="dark" disabled={pending}>
        {pending ? "Salvando..." : "Salvar desconto"}
      </Button>
    </form>
  );
}
