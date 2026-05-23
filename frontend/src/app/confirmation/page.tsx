import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { CheckoutConfirmation } from "@/components/reservations/CheckoutConfirmation";
import { PurchaseFlowLayout } from "@/components/reservations/PurchaseFlowLayout";
import { PageSection } from "@/components/ui/PageSection";

export default function ConfirmationPage() {
  return (
    <ProtectedRoute>
      <PageSection
        description="Confira os ingressos gerados depois da aprovação do pedido."
        eyebrow="Pedido"
        title="Confirmação"
      >
        <PurchaseFlowLayout currentStep="confirmation">
          <CheckoutConfirmation />
        </PurchaseFlowLayout>
      </PageSection>
    </ProtectedRoute>
  );
}
