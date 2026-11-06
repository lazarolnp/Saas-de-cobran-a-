import { AsaasProvider } from "./asaas/asaas-provider";
import { MockProvider } from "./mock/mock-provider";
import type { PaymentProvider, ProviderEnvironment, ProviderKind } from "./payment-provider";

export * from "./payment-provider";

/** Ambiente do provedor decidido pelo ambiente do app: nunca produção fora de produção. */
export function providerEnvironmentFor(appEnv: string | undefined): ProviderEnvironment {
  return appEnv === "production" ? "producao" : "sandbox";
}

/** Provedores que o motorista pode escolher neste ambiente. */
export function availableProviders(appEnv: string | undefined): ProviderKind[] {
  return appEnv === "production" ? ["asaas"] : ["asaas", "mock"];
}

export function createProvider(kind: ProviderKind, apiKey: string, appEnv: string | undefined): PaymentProvider {
  if (!availableProviders(appEnv).includes(kind)) {
    throw new Error(`Provedor ${kind} não é permitido em ${appEnv}`);
  }
  return kind === "mock" ? new MockProvider(apiKey) : new AsaasProvider(apiKey, providerEnvironmentFor(appEnv));
}
