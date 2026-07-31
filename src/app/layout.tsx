import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSessionProvider } from "@/components/session-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: {
    default: "InvestHub — Invista melhor. Viva o futuro.",
    template: "%s · InvestHub",
  },
  description:
    "Plataforma premium para gestão e análise de investimentos na B3: carteira, dividendos, valuation e recomendações inteligentes.",
  applicationName: "InvestHub",
  // Versões reduzidas: o arquivo original tem 1,3 MB, peso desnecessário para um favicon
  // e acima do que várias redes sociais aceitam ao gerar a pré-visualização.
  icons: {
    icon: "/icon-192.png",
    shortcut: "/icon-192.png",
    apple: "/icon-512.png",
  },
  openGraph: {
    title: "InvestHub — Invista melhor. Viva o futuro.",
    description:
      "Carteira, dividendos, valuation e recomendações de aporte para a Bolsa Brasileira.",
    siteName: "InvestHub",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "InvestHub" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AppSessionProvider>
            {children}
            <Toaster richColors position="top-right" />
          </AppSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
