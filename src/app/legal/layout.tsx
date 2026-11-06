export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div role="note" className="mb-6 rounded-xl border-2 border-warn bg-warn-bg p-4 font-semibold text-warn">
        TEXTO PROVISÓRIO. Este documento ainda não foi revisado por um advogado e não deve ser considerado
        juridicamente válido. Ele será substituído antes do lançamento.
      </div>
      <article className="flex flex-col gap-3 leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold">
        {children}
      </article>
    </main>
  );
}
