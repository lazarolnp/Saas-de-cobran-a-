"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { SHIFT_LABEL } from "@/lib/labels";
import { saveRoute, type RouteFormState } from "./actions";

export interface RouteValues {
  id?: string;
  name?: string;
  shift?: keyof typeof SHIFT_LABEL;
  schools?: string;
  vehicle?: string;
  capacity?: string;
}

export function RouteForm({ initial, submitLabel = "Salvar rota", onDone }: { initial?: RouteValues; submitLabel?: string; onDone?: () => void }) {
  const [state, action, pending] = useActionState<RouteFormState, FormData>(async (p, f) => {
    const r = await saveRoute(p, f);
    if (r.ok) onDone?.();
    return r;
  }, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} key={state.ok ? state.attempt : "form"} className="flex flex-col gap-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && !initial?.id && <Alert tone="ok">Rota salva!</Alert>}
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <Field label="Nome da rota" name="name" placeholder="Ex.: Manhã Centro" defaultValue={initial?.name} required error={fe.name} />
      <ShiftChoice defaultValue={initial?.shift} error={fe.shift} />
      <Field label="Escolas (opcional)" name="schools" placeholder="Separe por vírgula" defaultValue={initial?.schools} error={fe.schools} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Veículo (opcional)" name="vehicle" placeholder="Ex.: Van branca" defaultValue={initial?.vehicle} error={fe.vehicle} />
        <Field label="Lugares (opcional)" name="capacity" inputMode="numeric" defaultValue={initial?.capacity} error={fe.capacity} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}

export function ShiftChoice({ defaultValue, error, name = "shift" }: { defaultValue?: string; error?: string; name?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <fieldset aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-1 text-base font-medium">Turno</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(SHIFT_LABEL).map(([k, label]) => (
          <label
            key={k}
            className={`flex min-h-12 cursor-pointer items-center justify-center rounded-full border-2 px-3 text-lg font-semibold ${
              value === k ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white"
            }`}
          >
            <input type="radio" name={name} value={k} checked={value === k} onChange={() => setValue(k)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
