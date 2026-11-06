import { IconBus } from "@/components/icons";
import { PRODUCT_NAME } from "@/lib/product";

/** Marca provisória: ícone de van em quadrado azul + nome do produto. */
export function BrandMark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11 rounded-2xl" : "h-9 w-9 rounded-xl";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`flex ${box} items-center justify-center bg-brand-600 text-white`} aria-hidden>
        <IconBus width={size === "lg" ? 26 : 22} height={size === "lg" ? 26 : 22} />
      </span>
      <span className={`${size === "lg" ? "text-2xl" : "text-lg"} font-bold tracking-tight text-brand-600`}>{PRODUCT_NAME}</span>
    </span>
  );
}
