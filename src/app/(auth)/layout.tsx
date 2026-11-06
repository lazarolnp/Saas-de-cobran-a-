import { PRODUCT_NAME } from "@/lib/product";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <header className="text-center">
        <p className="text-2xl font-bold text-brand-700">{PRODUCT_NAME}</p>
        <p className="mt-1 text-gray-700">A mensalidade do transporte escolar cai pelo Pix, sem você precisar cobrar.</p>
      </header>
      {children}
    </main>
  );
}
