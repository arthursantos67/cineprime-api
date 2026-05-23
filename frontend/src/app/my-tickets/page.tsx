import { Suspense } from "react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { MyTicketsClient } from "@/components/tickets/MyTicketsClient";
import { PageSection } from "@/components/ui/PageSection";
import { StateMessage } from "@/components/ui/StateMessage";

export default function MyTicketsPage() {
  return (
    <ProtectedRoute>
      <PageSection
        description="Consulte ingressos futuros e compras anteriores quando estiver autenticado."
        eyebrow="Conta"
        title="Meus ingressos"
      >
        <Suspense
          fallback={
            <StateMessage tone="loading" title="Carregando ingressos">
              Aguarde enquanto preparamos seus filtros.
            </StateMessage>
          }
        >
          <MyTicketsClient />
        </Suspense>
      </PageSection>
    </ProtectedRoute>
  );
}
