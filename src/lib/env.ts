import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente do SERVIDOR. Nunca importe este arquivo em
 * componentes de cliente ("server-only" quebra o build se isso acontecer).
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  /** 32 bytes em base64. Gere com: openssl rand -base64 32 */
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY deve ter 32 bytes em base64"),
  APP_URL: z.url().default("http://localhost:3000"),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) {
      // Mostra só os NOMES das variáveis com problema, nunca os valores.
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Variáveis de ambiente inválidas ou ausentes: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}
