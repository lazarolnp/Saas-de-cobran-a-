import { BrandMark } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <section className="bg-brand-600 px-4 pb-16 pt-8 text-white">
        <div className="mx-auto max-w-md">
          <span className="inline-block rounded-2xl bg-white px-3 py-2">
            <BrandMark size="lg" />
          </span>
          <h1 className="mt-6 text-3xl font-bold leading-tight">A mensalidade do transporte cai pelo Pix.</h1>
          <p className="mt-2 text-lg text-brand-50">O pai autoriza uma vez e todo mês cai sozinho. Sem planilha, sem constrangimento.</p>
        </div>
      </section>
      <main className="mx-auto -mt-10 flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-8">{children}</main>
    </div>
  );
}
