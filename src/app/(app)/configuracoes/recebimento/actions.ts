"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  connectProvider,
  regenerateWebhook,
  retestConnection,
  setEligibility,
  type WebhookSetup,
} from "@/services/provider-connection";

export type ConnectState = {
  ok?: boolean;
  message?: string;
  webhook?: WebhookSetup;
  /** Força o formulário a recomeçar limpo depois de uma tentativa. */
  attempt?: number;
};

async function actor() {
  const { user, tenant } = await requireTenant();
  if (!user || !tenant) throw new Error("Sessão expirada");
  return { tenantId: tenant.id, userId: user.id, userEmail: user.email };
}

const connectSchema = z.object({
  provider: z.enum(["asaas", "mock"]),
  apiKey: z.string().min(1),
});

export async function connectAction(prev: ConnectState, form: FormData): Promise<ConnectState> {
  const attempt = (prev.attempt ?? 0) + 1;
  const parsed = connectSchema.safeParse({ provider: form.get("provider"), apiKey: form.get("apiKey") });
  if (!parsed.success) return { ok: false, message: "Cole a chave de acesso para continuar.", attempt };
  try {
    const result = await connectProvider(await actor(), parsed.data);
    revalidatePath("/configuracoes", "layout");
    return { ...result, attempt };
  } catch (err) {
    logger.error("conectar_provedor_falhou", { err });
    return { ok: false, message: "Algo deu errado ao conectar. Tente de novo em instantes.", attempt };
  }
}

export async function retestAction(): Promise<ConnectState> {
  try {
    const result = await retestConnection(await actor());
    revalidatePath("/configuracoes", "layout");
    return result;
  } catch (err) {
    logger.error("retestar_provedor_falhou", { err });
    return { ok: false, message: "Não foi possível testar agora. Tente de novo em instantes." };
  }
}

export async function regenerateWebhookAction(): Promise<ConnectState> {
  try {
    const webhook = await regenerateWebhook(await actor());
    if (!webhook) return { ok: false, message: "Conecte sua conta de recebimento primeiro." };
    return {
      ok: true,
      message: webhook.mode === "automatico" ? "Aviso de pagamentos configurado de novo." : "Novo código gerado. Siga o passo a passo abaixo.",
      webhook,
    };
  } catch (err) {
    logger.error("renovar_webhook_falhou", { err });
    return { ok: false, message: "Não foi possível gerar um novo código agora." };
  }
}

export async function eligibilityAction(form: FormData) {
  const value = form.get("eligible");
  if (value !== "sim" && value !== "nao") return;
  await setEligibility(await actor(), value === "sim");
  revalidatePath("/configuracoes", "layout");
}
