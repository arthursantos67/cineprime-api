import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PurchaseFlowLayout } from "@/components/reservations/PurchaseFlowLayout";
import { PageSection } from "@/components/ui/PageSection";
import { StateMessage } from "@/components/ui/StateMessage";

export default function ConfirmationPage() {
  return (
    <ProtectedRoute>
      <PageSection
        description="Confira os ingressos gerados depois da aprovação do pedido."
        eyebrow="Pedido"
        title="Confirmação"
      >
        <PurchaseFlowLayout currentStep="confirmation">
          <StateMessage tone="success" title="Pronto para exibir ingressos">
            Esta página receberá os dados da compra concluída e mostrará os
            ingressos com identificação visual.
          </StateMessage>
        </PurchaseFlowLayout>
      </PageSection>
    </ProtectedRoute>
  );
}
