"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { allowRequest, clientIp, resetRequests } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { serverEnv } from "@/lib/env";

/** `values` devolve o que foi digitado (nunca a senha), para o formulário não se apagar após um erro. */
export type FormState = { error?: string; fieldErrors?: Record<string, string>; info?: string; values?: Record<string, string> };

function keep(form: FormData, fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f, String(form.get(f) ?? "")]));
}

const MSG_LIMITE = "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";

const signInSchema = z.object({
  email: z.email("Digite um e-mail válido.").trim().toLowerCase(),
  password: z.string().min(1, "Digite sua senha."),
});

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const values = keep(form, ["email"]);
  const parsed = signInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: flatten(parsed.error), values };
  const { email, password } = parsed.data;

  const ip = await clientIp();
  // 5 tentativas por e-mail+IP a cada 15 min; 30 por IP (vários e-mails).
  const ok =
    (await allowRequest("login", `${ip}:${email}`, 5, 900)) && (await allowRequest("login-ip", ip, 30, 900));
  if (!ok) return { error: MSG_LIMITE, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Falta confirmar seu e-mail. Abra a mensagem que enviamos e toque no link.", values };
    }
    // Mensagem genérica: não revela se o e-mail existe.
    return { error: "E-mail ou senha não conferem. Confira e tente de novo.", values };
  }
  // Só as tentativas erradas contam: quem acerta a senha zera o contador.
  await resetRequests("login", `${ip}:${email}`);
  redirect("/inicio");
}

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Digite seu nome.").max(120),
  business_name: z.string().trim().min(2, "Digite o nome do seu transporte.").max(120),
  email: z.email("Digite um e-mail válido.").trim().toLowerCase(),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(72),
  terms: z.literal("on", { error: "Para continuar, aceite os termos de uso e a política de privacidade." }),
});

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const values = keep(form, ["name", "business_name", "email", "terms"]);
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: flatten(parsed.error), values };
  const { email, password, name, business_name } = parsed.data;

  if (!(await allowRequest("signup", await clientIp(), 5, 3600))) return { error: MSG_LIMITE, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, business_name },
      emailRedirectTo: `${serverEnv().APP_URL}/auth/confirmar`,
    },
  });
  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { fieldErrors: { email: "Já existe uma conta com este e-mail. Toque em \"Entrar\"." }, values };
    }
    if (error.code === "weak_password") return { fieldErrors: { password: "Escolha uma senha mais forte." }, values };
    logger.warn("cadastro_falhou", { code: error.code, status: error.status });
    return { error: "Não foi possível criar sua conta agora. Tente de novo em instantes.", values };
  }
  // Com confirmação de e-mail ligada (produção), ainda não há sessão.
  if (!data.session) {
    return { info: "Conta criada! Enviamos um e-mail para você confirmar. Depois é só entrar." };
  }
  redirect("/inicio");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}

function flatten(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
