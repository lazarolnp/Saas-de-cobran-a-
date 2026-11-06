/**
 * Serviço de conexão com o provedor, contra o banco local (com o MockProvider).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { decrypt, sha256 } from "@/lib/crypto";
import { resetMockProvider, mockSimulator } from "@/providers/mock/mock-provider";
import { connectProvider, getProviderForTenant, isPublicUrl, retestConnection, setupWebhook } from "@/services/provider-connection";
import { connect, createAuthUser, deleteAuthUser } from "./helpers";

let db: pg.Client;
let A: Awaited<ReturnType<typeof createAuthUser>>;
const actor = () => ({ tenantId: A.tenantId, userId: A.userId, userEmail: A.email });

beforeAll(async () => {
  db = connect();
  await db.connect();
  A = await createAuthUser(db, "prov");
});
afterAll(async () => {
  await deleteAuthUser(db, A.userId, A.tenantId);
  await db.end();
});
beforeEach(() => resetMockProvider());

describe("conectar provedor", () => {
  it("chave recusada não é gravada", async () => {
    const r = await connectProvider(actor(), { provider: "mock", apiKey: "mock_recusar" });
    expect(r.ok).toBe(false);
    const { rows } = await db.query("select 1 from provider_connections where tenant_id = $1", [A.tenantId]);
    expect(rows).toHaveLength(0);
  });

  it("chave aceita é gravada criptografada, com dica dos 4 últimos caracteres", async () => {
    const r = await connectProvider(actor(), { provider: "mock", apiKey: "  mock_minha_chave_1234  " });
    expect(r).toMatchObject({ ok: true, webhook: { mode: "automatico" } });
    const { rows } = await db.query("select api_key_encrypted, api_key_hint, status, environment from provider_connections where tenant_id = $1", [A.tenantId]);
    expect(rows[0]).toMatchObject({ api_key_hint: "1234", status: "ok", environment: "sandbox" });
    expect(rows[0].api_key_encrypted).not.toContain("mock_minha_chave");
    expect(decrypt(rows[0].api_key_encrypted, process.env.ENCRYPTION_KEY!)).toBe("mock_minha_chave_1234");

    // Webhook cadastrado no provedor com o token cujo hash ficou no banco.
    const hooks = [...mockSimulator._state().webhooks.values()];
    expect(hooks).toHaveLength(1);
    const wh = await db.query("select public_id, token_hash from webhook_endpoints where tenant_id = $1", [A.tenantId]);
    expect(hooks[0].url).toContain(`/api/webhooks/mock/${wh.rows[0].public_id}`);
    expect(sha256(hooks[0].authToken)).toBe(wh.rows[0].token_hash);

    const audit = await db.query("select action, metadata::text from audit_log where tenant_id = $1", [A.tenantId]);
    expect(audit.rows.map((r) => r.action)).toContain("provedor.conectado");
    expect(JSON.stringify(audit.rows)).not.toContain("mock_minha_chave");
  });

  it("o provedor do tenant é montado com a chave decriptada", async () => {
    const p = await getProviderForTenant(A.tenantId);
    expect(p?.kind).toBe("mock");
    expect((await p!.testConnection()).ok).toBe(true);
    expect((await retestConnection(actor())).ok).toBe(true);
  });

  it("renovar o webhook mantém a URL e troca o token", async () => {
    const before = await db.query("select public_id, token_hash from webhook_endpoints where tenant_id = $1", [A.tenantId]);
    await setupWebhook(actor(), (await getProviderForTenant(A.tenantId))!);
    const after = await db.query("select public_id, token_hash from webhook_endpoints where tenant_id = $1", [A.tenantId]);
    expect(after.rows[0].public_id).toBe(before.rows[0].public_id);
    expect(after.rows[0].token_hash).not.toBe(before.rows[0].token_hash);
  });

  it("Asaas com APP_URL local cai no passo a passo manual (sem chamar a API de webhook)", () => {
    expect(isPublicUrl("http://localhost:3000/api/webhooks/asaas/x")).toBe(false);
    expect(isPublicUrl("https://app.exemplo.com.br/api/webhooks/asaas/x")).toBe(true);
  });
});
