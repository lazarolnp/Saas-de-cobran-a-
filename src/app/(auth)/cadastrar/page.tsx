import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { TRIAL_DAYS } from "@/lib/product";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastrarPage() {
  return (
    <Card>
      <h2 className="text-2xl font-bold">Criar conta</h2>
      <p className="mb-4 mt-1 text-gray-700">{TRIAL_DAYS} dias grátis. Não pedimos cartão.</p>
      <SignUpForm />
      <p className="mt-6 text-center text-base">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-brand-700 underline">
          Entrar
        </Link>
      </p>
    </Card>
  );
}
