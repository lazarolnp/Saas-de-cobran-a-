import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/crypto";
import { logger } from "@/lib/logger";

/**
 * Limite de tentativas guardado no Postgres (funciona em serverless, onde a
 * memória não é compartilhada entre instâncias). A chave é um hash: o IP e o
 * e-mail nunca ficam gravados em claro.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

export async function allowRequest(scope: string, identifier: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
      p_key: sha256(`${scope}:${identifier}`),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    // Falha no limitador não pode derrubar o login; registra e deixa passar.
    logger.error("rate_limit_falhou", { scope, err });
    return true;
  }
}

/** Zera o contador (ex.: depois de um login bem-sucedido). */
export async function resetRequests(scope: string, identifier: string): Promise<void> {
  const { error } = await createAdminClient().from("rate_limits").delete().eq("key", sha256(`${scope}:${identifier}`));
  if (error) logger.warn("rate_limit_reset_falhou", { scope, code: error.code });
}
