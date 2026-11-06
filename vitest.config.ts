import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        // Precisa do Supabase local rodando (npm run db:start).
        plugins: [tsconfigPaths()],
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
