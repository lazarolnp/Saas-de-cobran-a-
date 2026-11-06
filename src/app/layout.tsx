import type { Metadata, Viewport } from "next";
import { PRODUCT_NAME } from "@/lib/product";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: "Cobrança da mensalidade do transporte escolar pelo Pix, sem constrangimento.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1557b0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col text-base">{children}</body>
    </html>
  );
}
