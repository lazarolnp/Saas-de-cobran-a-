import { defineConfig, devices } from "@playwright/test";

/**
 * Testes ponta a ponta. Precisam do Supabase local com o seed aplicado:
 *   npm run db:reset && npm run db:seed && npm run build && npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
  },
  // Celular pequeno (360 px), o público principal.
  projects: [{ name: "celular-360", use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 760 } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: "http://localhost:3000/entrar", reuseExistingServer: true, timeout: 60_000 },
});
