import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { ChatWidget } from "@/components/chatbot/ChatWidget";
import { AuthProvider } from "@/contexts/AuthContext";
import { ReservationProvider } from "@/contexts/ReservationContext";
import { I18nProvider } from "@/i18n";
import { getServerLocale, getTranslator } from "@/i18n/server";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const t = getTranslator(locale);

  return {
    title: "Cine Prime",
    description: t("metadata.description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  const t = getTranslator(locale);

  return (
    <html lang={locale}>
      <body>
        <I18nProvider initialLocale={locale}>
          <AuthProvider>
            <ReservationProvider>
              <div className="app-shell">
                <a className="skip-link" href="#conteudo">
                  {t("layout.skipContent")}
                </a>
                <AppHeader />
                <main className="main-content" id="conteudo" tabIndex={-1}>
                  <div className="shell-container">{children}</div>
                </main>
                <ChatWidget />
              </div>
            </ReservationProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
