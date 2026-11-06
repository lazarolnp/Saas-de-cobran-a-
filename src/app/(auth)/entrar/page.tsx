import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Entrar" };

export default function EntrarPage() {
  return (
    <Card>
      <h2 className="mb-4 text-2xl font-bold">Entrar</h2>
      <SignInForm />
      <p className="mt-6 text-center text-base">
        Ainda não tem conta?{" "}
        <Link href="/cadastrar" className="font-semibold text-brand-700 underline">
          Criar conta grátis
        </Link>
      </p>
    </Card>
  );
}
