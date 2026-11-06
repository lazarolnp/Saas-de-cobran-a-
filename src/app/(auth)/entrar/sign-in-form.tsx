"use client";

import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { signIn, type FormState } from "../actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      <Button type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
