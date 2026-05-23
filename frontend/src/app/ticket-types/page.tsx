import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PurchaseFlowLayout } from "@/components/reservations/PurchaseFlowLayout";
import { PurchaseFlowGuard } from "@/components/reservations/PurchaseFlowGuard";
import { TicketTypeSelection } from "@/components/reservations/TicketTypeSelection";
import { PageSection } from "@/components/ui/PageSection";

export default function TicketTypeSelectionPage() {
  return (
    <ProtectedRoute>
      <PurchaseFlowGuard>
        <PageSection
          description="Defina o tipo de ingresso para cada assento reservado e acompanhe o subtotal antes do pagamento."
          eyebrow="Ingressos"
          title="Tipos de ingresso"
        >
          <PurchaseFlowLayout
            currentStep="ticket-types"
            summaryActionHref="/checkout"
            summaryActionLabel="Ir para pagamento"
          >
            <TicketTypeSelection />
          </PurchaseFlowLayout>
        </PageSection>
      </PurchaseFlowGuard>
    </ProtectedRoute>
  );
}
