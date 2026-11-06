import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Badge, Card, IconTile } from "@/components/ui";
import { IconPix } from "@/components/icons";
import { formatDateTimeBR } from "@/lib/dates";
import { requireTenant } from "@/lib/supabase/server";
import { availableProviders } from "@/providers";
import { eligibilityAction } from "./actions";
import { ConnectForm, RegenerateWebhookButton, RetestButton } from "./connect-form";

export const metadata: Metadata = { title: "Recebimento" };

export default async function RecebimentoPage() {
  const { supabase, tenant } = await requireTenant();
  if (!tenant) redirect("/entrar");

  // RLS: só a linha do próprio tenant, e só colunas sem segredo.
  const { data: conn } = await supabase
    .from("provider_connections")
    .select("provider, environment, api_key_hint, status, validated_at, last_error_message")
    .maybeSingle();

  const providers = availableProviders(process.env.APP_ENV);
  const eligibility = tenant.pix_automatico_eligibility;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/configuracoes" className="inline-flex min-h-12 items-center text-base font-semibold text-brand-700">
        ← Ajustes
      </Link>
      <h1 className="text-2xl font-bold">Onde você recebe</h1>
      <p className="text-gray-700">
        O dinheiro dos pais cai direto na <strong>sua</strong> conta no Asaas. Nós só organizamos as cobranças: não tocamos no seu dinheiro.
      </p>

      {/* D2: elegibilidade ao Pix Automático */}
      <Card>
        <h2 className="text-lg font-bold">Você tem CNPJ ou MEI aberto há mais de 6 meses?</h2>
        <p className="mt-1 text-gray-700">
          O Pix Automático (o pai autoriza uma vez e todo mês cai sozinho) só funciona para empresa com CNPJ ativo há pelo menos 6
          meses.
        </p>
        <form action={eligibilityAction} className="mt-3 grid grid-cols-2 gap-3">
          <ChoiceButton name="eligible" value="sim" active={eligibility === "elegivel"} label="Sim, tenho" />
          <ChoiceButton name="eligible" value="nao" active={eligibility === "nao_elegivel"} label="Ainda não" />
        </form>
        {eligibility === "nao_elegivel" && (
          <div className="mt-3">
            <Alert tone="info">
              Sem problema! Você usa o modo <strong>Pix comum + lembretes</strong>: todo mês o sistema gera o Pix de cada aluno e te
              ajuda a lembrar os pais pelo WhatsApp. Quando seu CNPJ completar 6 meses, é só voltar aqui.
            </Alert>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <IconTile>
            <IconPix />
          </IconTile>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">Conta de recebimento</h2>
            {conn ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone={conn.status === "ok" ? "ok" : "danger"}>{conn.status === "ok" ? "Conectada" : "Com problema"}</Badge>
                <span className="text-gray-700">
                  {conn.provider === "asaas" ? "Asaas" : "Simulado"} · {conn.environment === "sandbox" ? "teste" : "produção"} · chave final{" "}
                  {conn.api_key_hint}
                </span>
              </div>
            ) : (
              <p className="mt-1 text-gray-700">Ainda não conectada.</p>
            )}
            {conn?.validated_at && <p className="mt-1 text-sm text-gray-600">Último teste com sucesso: {formatDateTimeBR(conn.validated_at)}</p>}
          </div>
        </div>

        {conn?.last_error_message && (
          <div className="mt-3">
            <Alert tone={conn.status === "ok" ? "warn" : "danger"}>{conn.last_error_message}</Alert>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {conn && <RetestButton />}
          <ConnectForm providers={providers} connected={Boolean(conn)} />
          {conn && <RegenerateWebhookButton />}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">Como pegar sua chave no Asaas</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-gray-800">
          <li>Entre no Asaas pelo <strong>navegador</strong> (a chave não é gerada pelo aplicativo do Asaas).</li>
          <li>
            Abra a área de <strong>Integrações</strong> e crie uma nova chave de API. Só o administrador da conta consegue.
          </li>
          <li>Copie a chave na hora: o Asaas mostra ela uma vez só.</li>
          <li>Cole aqui em cima e toque em <strong>Testar e conectar</strong>.</li>
        </ol>
        {providers.includes("mock") && (
          <p className="mt-3 text-sm text-gray-600">
            Ambiente de teste: use uma chave do <strong>Asaas Sandbox</strong>, nunca a de produção. Para o modo simulado, use qualquer
            chave começando com <code>mock_</code>.
          </p>
        )}
      </Card>
    </div>
  );
}

function ChoiceButton({ name, value, label, active }: { name: string; value: string; label: string; active: boolean }) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      aria-pressed={active}
      className={`min-h-12 rounded-full border-2 px-4 text-lg font-semibold ${
        active ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-900 hover:border-brand-600"
      }`}
    >
      {label}
    </button>
  );
}
