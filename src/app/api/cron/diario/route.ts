import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDailyBilling } from "@/services/billing";

/**
 * Rotina diária (00:30 em São Paulo; ver vercel.json). Para cada tenant com
 * conta de recebimento: adesões vencidas -> Pix comum, gera e envia as
 * cobranças do mês e marca atrasos.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });

  const { data: tenants, error } = await createAdminClient().from("provider_connections").select("tenant_id").eq("status", "ok");
  if (error) return NextResponse.json({ error: "falha ao listar tenants" }, { status: 500 });

  const totals = { tenants: 0, fallbacks: 0, generated: 0, sent: 0, failed: 0, overdue: 0, errors: 0 };
  for (const { tenant_id } of tenants ?? []) {
    try {
      const r = await runDailyBilling(tenant_id);
      totals.tenants++;
      totals.fallbacks += r.fallbacks;
      totals.generated += r.generated;
      totals.sent += r.sent;
      totals.failed += r.failed;
      totals.overdue += r.overdue;
    } catch (err) {
      totals.errors++;
      logger.error("cron_diario_tenant_falhou", { tenantId: tenant_id, err });
    }
  }
  logger.info("cron_diario", totals);
  return NextResponse.json(totals);
}
