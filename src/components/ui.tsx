/**
 * Componentes básicos acessíveis, mobile-first.
 * Alvos de toque com pelo menos 48px de altura (requisito: >= 44px).
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "dark" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-gray-400",
  dark: "bg-ink text-white hover:bg-black disabled:bg-gray-400",
  secondary: "bg-white text-brand-700 border-2 border-brand-600 hover:bg-brand-50 disabled:opacity-60",
  danger: "bg-danger text-white hover:opacity-90 disabled:opacity-60",
  ghost: "bg-transparent text-brand-700 underline-offset-4 hover:underline",
};

const base =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-lg font-semibold transition-colors disabled:cursor-not-allowed";

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Field({
  label,
  name,
  hint,
  error,
  ...input
}: ComponentProps<"input"> & { label: string; name: string; hint?: string; error?: string }) {
  const id = `f-${name}`;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-base font-medium text-gray-900">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-12 rounded-xl border-2 bg-white px-4 text-lg text-gray-900 placeholder:text-gray-500 ${
          error ? "border-danger" : "border-gray-300 focus:border-brand-600"
        }`}
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-gray-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "danger"; children: ReactNode }) {
  const tones = {
    info: "bg-brand-50 text-brand-800 border-brand-100",
    ok: "bg-ok-bg text-ok border-ok/20",
    warn: "bg-warn-bg text-warn border-warn/20",
    danger: "bg-danger-bg text-danger border-danger/20",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-base ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 ${className}`}>{children}</section>;
}

export function Badge({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  const tones = {
    info: "bg-brand-50 text-brand-700",
    ok: "bg-ok-bg text-ok",
    warn: "bg-warn-bg text-warn",
    danger: "bg-danger-bg text-danger",
    neutral: "bg-gray-100 text-gray-700",
  };
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Ícone dentro de um quadrado arredondado azul-claro (padrão visual dos cartões). */
export function IconTile({ children }: { children: ReactNode }) {
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600" aria-hidden>{children}</span>;
}
