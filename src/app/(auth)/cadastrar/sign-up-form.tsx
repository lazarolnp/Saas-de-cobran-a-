"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { signUp, type FormState } from "../actions";

export function SignUpForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});
  if (state.info) return <Alert tone="ok">{state.info}</Alert>;
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Seu nome" name="name" autoComplete="name" required defaultValue={v.name} error={fe.name} />
      <Field
        label="Nome do seu transporte"
        name="business_name"
        placeholder="Ex.: Tio João Transporte Escolar"
        hint="É o nome que os pais vão ver na cobrança."
        required
        defaultValue={v.business_name}
        error={fe.business_name}
      />
      <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={v.email} error={fe.email} />
      <Field
        label="Crie uma senha"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Pelo menos 8 caracteres."
        required
        error={fe.password}
      />
      <div className="flex flex-col gap-1">
        <label className="flex min-h-12 items-start gap-3 text-base">
          <input
            type="checkbox"
            name="terms"
            defaultChecked={v.terms === "on"}
            className="mt-1 h-6 w-6 shrink-0 accent-brand-600"
            aria-invalid={fe.terms ? true : undefined}
            aria-describedby={fe.terms ? "terms-error" : undefined}
          />
          <span>
            Li e aceito os{" "}
            <Link href="/legal/termos" target="_blank" className="font-semibold text-brand-700 underline">
              termos de uso
            </Link>{" "}
            e a{" "}
            <Link href="/legal/privacidade" target="_blank" className="font-semibold text-brand-700 underline">
              política de privacidade
            </Link>
            .
          </span>
        </label>
        {fe.terms && (
          <p id="terms-error" className="text-sm font-medium text-danger">
            {fe.terms}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Criando..." : "Criar minha conta"}
      </Button>
    </form>
  );
}
