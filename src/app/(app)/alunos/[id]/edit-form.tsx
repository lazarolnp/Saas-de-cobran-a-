"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { ShiftChoice } from "../../rotas/route-form";
import { updateStudent, type EditState } from "../actions";

export interface EditValues {
  studentId: string;
  guardianId: string;
  studentName: string;
  school: string;
  grade: string;
  route: string;
  shift: string;
  guardianName: string;
  whatsapp: string;
  email: string;
}

export function EditStudent({ initial, routes }: { initial: EditValues; routes: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<EditState, FormData>(async (p, f) => {
    const r = await updateStudent(p, f);
    if (r.ok) setOpen(false);
    return r;
  }, {});
  const fe = state.fieldErrors ?? {};

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        {state.ok && <Alert tone="ok">Dados atualizados.</Alert>}
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          Editar dados do aluno e contato
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="studentId" value={initial.studentId} />
      <input type="hidden" name="guardianId" value={initial.guardianId} />
      <Field label="Nome do aluno" name="studentName" defaultValue={initial.studentName} error={fe.studentName} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Escola" name="school" defaultValue={initial.school} error={fe.school} />
        <Field label="Série" name="grade" defaultValue={initial.grade} error={fe.grade} />
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Rota</span>
        <select name="route" defaultValue={initial.route} className="min-h-12 rounded-xl border-2 border-gray-300 bg-white px-4 text-lg">
          <option value="">Sem rota</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <ShiftChoice defaultValue={initial.shift} error={fe.shift} />
      <Field label="Nome do responsável" name="guardianName" defaultValue={initial.guardianName} error={fe.guardianName} />
      <Field label="WhatsApp" name="whatsapp" type="tel" inputMode="tel" defaultValue={initial.whatsapp} error={fe.whatsapp} />
      <Field label="E-mail (opcional)" name="email" type="email" defaultValue={initial.email} error={fe.email} />
      <p className="text-sm text-gray-600">Para trocar o CPF de quem paga, encerre este contrato e cadastre de novo (o CPF fica ligado às cobranças).</p>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-12 font-semibold text-gray-700">
        Cancelar
      </button>
    </form>
  );
}
