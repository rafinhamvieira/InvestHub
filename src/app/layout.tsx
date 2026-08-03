import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSessionProvider } from "@/components/session-provider";
import "./globals.css";

/**
 * Fontes servidas do próprio repositório, não do Google.
 *
 * `next/font/google` baixa os arquivos a cada `next build`. Isso transforma toda publicação
 * em refém do DNS: já derrubou o deploy aqui, com o build falhando em `fonts.googleapis.com`
 * por um problema de rede que nada tinha a ver com o código. Com os `.woff2` versionados, o
 * build inteiro roda offline.
 *
 * Vantagem de privacidade que vem junto: nenhum visitante bate no servidor do Google para
 * carregar a página.
 *
 * Os arquivos vêm de `scripts/fetch-fonts.ts`. Ambos são variáveis — um arquivo só cobre a
 * faixa inteira de pesos.
 */
const inter = localFont({
  src: "../fonts/inter-latin.woff2",
  weight: "100 900",
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
});

/**
 * Base para resolver os caminhos relativos das imagens de pré-visualização.
 *
 * Sem ela o Next resolve `/icon-512.png` contra `http://localhost:3000` e avisa a cada
 * build — o que quebra a prévia do link em qualquer rede social ou aplicativo de mensagem,
 * porque o endereço aponta para a máquina de quem clicou.
 *
 * Nunca lança: `APP_URL` malformada derrubaria o build inteiro por causa de uma miniatura.
 */
function resolveMetadataBase(): URL {
  try {
    return new URL(process.env.APP_URL ?? "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
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
