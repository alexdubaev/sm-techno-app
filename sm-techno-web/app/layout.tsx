import type { Metadata } from "next";
import "./globals.css";
import "./glassy.css";
import { StockShareSessionBridge } from "@/components/stock/stock-share-session-bridge";
import { AuthProvider } from "@/components/auth-provider";
import { defaultUiTheme, uiThemeBootstrap } from "@/lib/ui-theme";

export const metadata: Metadata = {
  applicationName: "СМ ТЕХНО",
  title: "СМ ТЕХНО — локальный прайс и заказы",
  description: "Веб-интерфейс локального прайса, остатков и счетов СМ ТЕХНО",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "256x256" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icon.png", sizes: "256x256", type: "image/png" }],
    shortcut: [{ url: "/icon.png", type: "image/png", sizes: "256x256" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-ui-theme={defaultUiTheme} className="h-full antialiased" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: uiThemeBootstrap }} /></head>
      <body className="min-h-full flex flex-col">
        <AuthProvider><StockShareSessionBridge />{children}</AuthProvider>
      </body>
    </html>
  );
}
