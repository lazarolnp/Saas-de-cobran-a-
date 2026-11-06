"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { IconCopy } from "@/components/icons";
import { connectAction, regenerateWebhookAction, retestAction, type ConnectState } from "./actions";
import type { WebhookSetup } from "@/services/provider-connection";

export function ConnectForm({ providers, connected }: { providers: ("asaas" | "mock")[]; connected: boolean }) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectAction, {});
  const [open, setOpen] = useState(!connected);

  if (!open && !(state.attempt && !state.ok)) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Trocar a chave de acesso
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.message && <Alert tone={state.ok ? "ok" : "danger"}>{state.message}</Alert>}
      {state.ok && state.webhook && <WebhookInstructions setup={state.webhook} />}
      {!state.ok && (
        <form action={action} className="flex flex-col gap-4" key={state.attempt ?? 0} autoComplete="off">
          {providers.length > 1 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-base font-medium">Onde você recebe?</legend>
              {providers.map((p) => (
                <label key={p} className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-gray-200 px-4 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                  <input type="radio" name="provider" value={p} defaultChecked={p === "asaas"} className="h-5 w-5 accent-brand-600" />
                  <span className="text-lg">{p === "asaas" ? "Asaas" : "Simulado (só para testes, sem dinheiro de verdade)"}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <input type="hidden" name="provider" value="asaas" />
          )}
          <Field
            label="Chave de acesso (API)"
            name="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            hint="Ela fica guardada de forma criptografada. Nem nós conseguimos ver depois."
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Testando a conexão..." : "Testar e conectar"}
          </Button>
        </form>
      )}
    </div>
  );
}

export function RetestButton() {
  const [state, action, pending] = useActionState<ConnectState, FormData>(async () => retestAction(), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <Alert tone={state.ok ? "ok" : "danger"}>{state.message}</Alert>}
      <Button type="submit" variant="dark" disabled={pending}>
        {pending ? "Testando..." : "Testar conexão"}
      </Button>
    </form>
  );
}

export function RegenerateWebhookButton() {
  const [state, action, pending] = useActionState<ConnectState, FormData>(async () => regenerateWebhookAction(), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <Alert tone={state.ok ? "ok" : "danger"}>{state.message}</Alert>}
      {state.webhook && <WebhookInstructions setup={state.webhook} />}
      <Button type="submit" variant="ghost" disabled={pending} className="min-h-12">
        {pending ? "Configurando..." : "Configurar o aviso de pagamentos de novo"}
      </Button>
    </form>
  );
}

function WebhookInstructions({ setup }: { setup: WebhookSetup }) {
  if (setup.mode === "automatico") {
    return <Alert tone="ok">Pronto: quando um pai pagar, o sistema fica sabendo sozinho.</Alert>;
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-warn bg-warn-bg p-4 text-gray-900">
      <p className="font-semibold text-warn">Falta um passo para o sistema saber quando um pai pagar</p>
      <p>{setup.reason}</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>No site do Asaas, abra a área de Webhooks e crie um novo.</li>
        <li>Cole o endereço e o código abaixo.</li>
        <li>Marque os eventos de cobrança e de Pix Automático.</li>
      </ol>
      <CopyField label="Endereço (URL)" value={setup.url} />
      <CopyField label="Código de segurança (token)" value={setup.token} />
      <p className="text-sm font-medium">Guarde o código agora: por segurança, ele não aparece de novo.</p>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-1 flex items-stretch gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl bg-white px-3 py-3 text-sm">{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
          className="flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-xl bg-ink px-3 text-sm font-semibold text-white"
          aria-label={`Copiar ${label}`}
        >
          <IconCopy width={18} height={18} aria-hidden />
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
