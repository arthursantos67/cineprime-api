import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { AuthProvider } from "@/contexts/AuthContext";
import { ReservationProvider } from "@/contexts/ReservationContext";

import "./globals.css";

export const metadata: Metadata = {
  title: "CinePrime",
  description: "Frontend web para compra de ingressos do CinePrime.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          <ReservationProvider>
            <div className="app-shell">
              <a className="skip-link" href="#conteudo">
                Pular para o conteúdo
              </a>
              <AppHeader />
              <main className="main-content" id="conteudo" tabIndex={-1}>
                <div className="shell-container">{children}</div>
              </main>
            </div>
          </ReservationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
