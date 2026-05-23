import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { CheckoutReview } from "@/components/reservations/CheckoutReview";
import { PurchaseFlowLayout } from "@/components/reservations/PurchaseFlowLayout";
import { PurchaseFlowGuard } from "@/components/reservations/PurchaseFlowGuard";
import { PageSection } from "@/components/ui/PageSection";

export default function CheckoutPage() {
  return (
    <ProtectedRoute>
      <PurchaseFlowGuard>
        <PageSection
          description="Revise a compra, escolha a forma de pagamento e finalize seu pedido com mensagens claras de carregamento e erro."
          eyebrow="Pagamento"
          title="Finalizar compra"
        >
          <PurchaseFlowLayout currentStep="checkout">
            <CheckoutReview />
          </PurchaseFlowLayout>
        </PageSection>
      </PurchaseFlowGuard>
    </ProtectedRoute>
  );
}
