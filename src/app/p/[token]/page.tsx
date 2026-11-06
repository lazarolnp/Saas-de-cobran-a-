import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { allowRequest, clientIp } from "@/lib/rate-limit";
import { loadPublicLink } from "@/services/public-link";
import { acceptAction } from "./actions";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = { title: "Pagamento do transporte escolar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Página pública do responsável (sem login). Token longo e aleatório; a página
 * mostra só o primeiro nome do aluno, o transporte e os valores.
 */
export default async function PublicPayPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  if (!(await allowRequest("publico", await clientIp(), 60, 600))) {
    return <Shell><Message title="Muitos acessos seguidos" text="Espere alguns minutos e abra o link de novo." /></Shell>;
  }
  const view = await loadPublicLink(token);
  if (!view) return <Shell><Message title="Link não encontrado" text="Confira se o link está completo ou peça um novo ao seu motorista." /></Shell>;

  const header = (
    <div className="text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{view.tenantName}</p>
      <h1 className="mt-1 text-2xl font-bold">Transporte escolar de {view.studentFirstName}</h1>
    </div>
  );

  if (view.state === "pago") return <Shell>{header}<Message tone="ok" title="Pagamento recebido. Obrigado!" text={view.automatic ? "Pronto! Nos próximos meses o pagamento cai sozinho, do jeito que você autorizou no seu banco." : "Está tudo certo com este mês."} /></Shell>;
  if (view.state === "cancelado") return <Shell>{header}<Message title="Esta cobrança foi cancelada" text="Não é preciso pagar. Se tiver dúvida, fale com o motorista." /></Shell>;
  if (view.state === "expirado") return <Shell>{header}<Message title="Este link venceu" text="Por segurança, o link tem validade. Peça um novo ao motorista pelo WhatsApp." /></Shell>;

  if (view.needsConsent) {
    return (
      <Shell>
        {header}
        <Summary view={view} />
        <section className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
          <h2 className="text-lg font-bold">Antes de pagar</h2>
          <p className="mt-2 text-gray-800">
            Seu nome, CPF e WhatsApp são usados por <strong>{view.tenantName}</strong> apenas para cobrar a mensalidade do transporte e
            enviar lembretes de pagamento. Não pedimos documentos nem fotos do aluno.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            [TEXTO PROVISÓRIO: base legal e redação a revisar por advogado] Tratamento para execução do contrato de transporte (LGPD,
            art. 7º, V). Dúvidas ou pedidos sobre seus dados: fale com {view.tenantName}
            {view.tenantPhone ? ` pelo telefone ${formatPhone(view.tenantPhone)}` : ""}.{" "}
            <Link href="/legal/privacidade" className="font-semibold text-brand-700 underline">
              Política de privacidade
            </Link>
          </p>
          <form action={acceptAction} className="mt-4">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="min-h-14 w-full rounded-full bg-brand-600 text-xl font-bold text-white">
              Entendi, quero pagar
            </button>
          </form>
        </section>
      </Shell>
    );
  }

  const qr = view.pixPayload ? await QRCode.toDataURL(view.pixPayload, { margin: 1, width: 560, errorCorrectionLevel: "M" }) : null;
  const suggestedMax = Math.ceil((view.monthlyCents * 1.1) / 100) * 100;

  return (
    <Shell>
      {header}
      <Summary view={view} />

      {view.pixPayload && qr ? (
        <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-gray-200">
          <h2 className="text-lg font-bold">Pague pelo app do seu banco</h2>
          <CopyButton value={view.pixPayload} />
          <label htmlFor="pix-copia-e-cola" className="text-sm font-medium text-gray-700">
            Ou copie o código abaixo (Pix copia e cola):
          </label>
          <textarea id="pix-copia-e-cola" readOnly value={view.pixPayload} rows={3} className="w-full resize-none rounded-xl border-2 border-gray-200 bg-gray-50 p-3 font-mono text-xs break-all" />
          <details>
            <summary className="flex min-h-12 cursor-pointer items-center font-semibold text-brand-700">Mostrar QR Code (para pagar de outro celular)</summary>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR Code do Pix" width={280} height={280} className="mx-auto mt-2 h-auto w-full max-w-[280px]" />
          </details>
          <p className="text-sm text-gray-600">Código válido até {view.automatic ? formatDateTimeBR(view.expiresAt) : formatDateBR(view.dueDate)}.</p>
        </section>
      ) : (
        <Message title="Código indisponível" text="Estamos preparando o Pix. Tente de novo em alguns minutos." />
      )}

      {view.automatic ? (
        <section className="rounded-2xl bg-brand-50 p-5 text-gray-900">
          <h2 className="text-lg font-bold text-brand-800">Pagou uma vez, os próximos caem sozinhos</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Abra o app do seu banco, entre em <strong>Pix</strong> e cole o código (ou leia o QR Code).</li>
            <li>Pague o valor de <strong>{formatBRL(view.amountCents)}</strong>.</li>
            <li>
              O banco vai perguntar se você <strong>autoriza o Pix Automático</strong> para os próximos meses. Autorize.
            </li>
            <li>
              O banco pede um <strong>valor máximo</strong> por mês. Sugerimos <strong>{formatBRL(suggestedMax)}</strong> (um pouco acima
              de {formatBRL(view.monthlyCents)}), para cobrir o reajuste do ano.
            </li>
          </ol>
          <p className="mt-3">
            Pronto: todo dia {view.dueDay} o valor cai sozinho. Você vê cada pagamento no extrato e pode <strong>cancelar quando quiser</strong>{" "}
            pelo app do banco.
          </p>
        </section>
      ) : (
        <p className="text-center text-gray-700">Se você já pagou, pode desconsiderar. Obrigado!</p>
      )}
    </Shell>
  );
}

function Summary({ view }: { view: NonNullable<Awaited<ReturnType<typeof loadPublicLink>>> }) {
  const [y, m] = view.competence.split("-");
  return (
    <section className="rounded-2xl bg-white p-5 text-center ring-1 ring-gray-200">
      <p className="text-gray-700">{view.automatic ? "Primeiro mês" : `Mensalidade de ${m}/${y}`}</p>
      <p className="text-4xl font-bold text-ink">{formatBRL(view.amountCents)}</p>
      {view.automatic ? (
        <p className="mt-1 text-gray-700">Depois, {formatBRL(view.monthlyCents)} por mês, todo dia {view.dueDay}.</p>
      ) : (
        <p className="mt-1 text-gray-700">Vencimento: {formatDateBR(view.dueDate)}</p>
      )}
    </section>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex justify-center">
        <BrandMark />
      </div>
      {children}
      <p className="mt-4 text-center text-xs text-gray-500">O pagamento vai direto para a conta do seu motorista. Nunca pedimos senha do banco.</p>
    </main>
  );
}

function Message({ title, text, tone = "info" }: { title: string; text: string; tone?: "info" | "ok" }) {
  return (
    <section className={`rounded-2xl p-5 text-center ${tone === "ok" ? "bg-ok-bg text-ok" : "bg-white ring-1 ring-gray-200"}`}>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className={`mt-2 ${tone === "ok" ? "" : "text-gray-700"}`}>{text}</p>
    </section>
  );
}

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "").replace(/^55/, "");
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : p;
}
