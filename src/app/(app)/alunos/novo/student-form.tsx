"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { MONTH_SHORT } from "@/lib/labels";
import { ShiftChoice } from "../../rotas/route-form";
import { createStudent, type StudentFormState } from "../actions";

export function StudentForm({ routes, today, siblingHint }: { routes: { id: string; name: string; shift: string }[]; today: string; siblingHint: string | null }) {
  const [state, action, pending] = useActionState<StudentFormState, FormData>(createStudent, {});
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const [monthsMode, setMonthsMode] = useState(v.monthsMode ?? "doze");
  const [discountKind, setDiscountKind] = useState(v.discountKind ?? "auto");
  const advancedError = Boolean(fe.startDate || fe.months || fe.discount || fe.prorata);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {Object.keys(fe).length > 0 && <Alert tone="danger">Confira os campos marcados em vermelho.</Alert>}

      <Section title="Aluno">
        <Field label="Nome do aluno" name="studentName" autoComplete="off" required defaultValue={v.studentName} error={fe.studentName} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Escola (opcional)" name="school" defaultValue={v.school} error={fe.school} />
          <Field label="Série (opcional)" name="grade" defaultValue={v.grade} error={fe.grade} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-route" className="text-base font-medium">
            Rota
          </label>
          <select id="f-route" name="route" defaultValue={v.route ?? ""} className="min-h-12 rounded-xl border-2 border-gray-300 bg-white px-4 text-lg">
            <option value="">Sem rota por enquanto</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <ShiftChoice defaultValue={v.shift} error={fe.shift} />
      </Section>

      <Section title="Quem paga" subtitle="Usamos só para gerar o Pix e mandar os lembretes.">
        <Field label="Nome do responsável" name="guardianName" autoComplete="off" required defaultValue={v.guardianName} error={fe.guardianName} />
        <Field label="CPF do responsável" name="cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" required error={fe.cpf} hint="O banco pede o CPF de quem paga o Pix. Guardamos criptografado." />
        <Field label="WhatsApp" name="whatsapp" type="tel" inputMode="tel" autoComplete="off" placeholder="(11) 98765-4321" required defaultValue={v.whatsapp} error={fe.whatsapp} />
        <Field label="E-mail (opcional)" name="email" type="email" inputMode="email" autoComplete="off" defaultValue={v.email} error={fe.email} />
      </Section>

      <Section title="Mensalidade">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor por mês" name="monthlyAmount" inputMode="decimal" placeholder="350,00" required defaultValue={v.monthlyAmount} error={fe.monthlyAmount} />
          <Field label="Dia de vencimento" name="dueDay" inputMode="numeric" placeholder="10" required defaultValue={v.dueDay} error={fe.dueDay} />
        </div>

        <details open={advancedError} className="rounded-xl border-2 border-gray-200 p-4">
          <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold text-brand-700">Mais opções (início, meses e desconto)</summary>
          <div className="mt-3 flex flex-col gap-4">
            <Field label="Começa a usar o transporte em" name="startDate" type="date" defaultValue={v.startDate ?? today} error={fe.startDate} />

            <fieldset>
              <legend className="mb-1 text-base font-medium">Quais meses têm cobrança?</legend>
              <div className="flex flex-col gap-2">
                {[
                  ["doze", "Todos os 12 meses"],
                  ["dez", "10 meses (sem janeiro e julho)"],
                  ["personalizada", "Escolher os meses"],
                ].map(([k, label]) => (
                  <label key={k} className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-gray-200 px-4 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                    <input type="radio" name="monthsMode" value={k} checked={monthsMode === k} onChange={() => setMonthsMode(k)} className="h-5 w-5 accent-brand-600" />
                    <span className="text-lg">{label}</span>
                  </label>
                ))}
              </div>
              {monthsMode === "personalizada" && (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {MONTH_SHORT.map((m, i) => (
                    <label key={m} className="flex min-h-12 items-center justify-center gap-1 rounded-xl border-2 border-gray-200 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                      <input type="checkbox" name="month" value={i + 1} defaultChecked={i !== 0 && i !== 6} className="h-5 w-5 accent-brand-600" />
                      <span className="font-semibold">{m}</span>
                    </label>
                  ))}
                </div>
              )}
              {fe.months && <p className="mt-1 text-sm font-medium text-danger">{fe.months}</p>}
            </fieldset>

            <fieldset>
              <legend className="mb-1 text-base font-medium">Desconto</legend>
              <select
                name="discountKind"
                value={discountKind}
                onChange={(e) => setDiscountKind(e.target.value)}
                className="min-h-12 w-full rounded-xl border-2 border-gray-300 bg-white px-4 text-lg"
                aria-label="Tipo de desconto"
              >
                <option value="auto">{siblingHint ? "Automático (desconto de irmão, se houver)" : "Sem desconto"}</option>
                <option value="nenhum">Sem desconto</option>
                <option value="percentual">Porcentagem (%)</option>
                <option value="valor">Valor em reais (R$)</option>
              </select>
              {(discountKind === "percentual" || discountKind === "valor") && (
                <div className="mt-3">
                  <Field
                    label={discountKind === "percentual" ? "Quantos %?" : "Quantos reais por mês?"}
                    name="discountValue"
                    inputMode="decimal"
                    defaultValue={v.discountValue}
                    error={fe.discount}
                  />
                </div>
              )}
              {siblingHint && discountKind === "auto" && <p className="mt-1 text-sm text-gray-600">{siblingHint}</p>}
              {fe.discount && discountKind === "auto" && <p className="mt-1 text-sm font-medium text-danger">{fe.discount}</p>}
            </fieldset>

            <label className="flex min-h-12 items-start gap-3">
              <input type="checkbox" name="prorata" defaultChecked={v.prorata === "on"} className="mt-1 h-6 w-6 accent-brand-600" />
              <span>
                <span className="text-lg font-medium">Primeiro mês proporcional</span>
                <span className="block text-sm text-gray-600">Cobra só os dias que faltam no mês em que começou.</span>
              </span>
            </label>
          </div>
        </details>
      </Section>

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar aluno"}
      </Button>
    </form>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <legend className="sr-only">{title}</legend>
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-gray-700">{subtitle}</p>}
      </div>
      {children}
    </fieldset>
  );
}
