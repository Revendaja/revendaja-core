import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppProviders } from "@/lib/providers/AppProviders";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Revendaja",
  description: "Gerencie sua loja Revendaja: vendas, estoque e vitrine.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-ink-50 text-ink-900">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
