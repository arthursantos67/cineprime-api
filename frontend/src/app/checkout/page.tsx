import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PurchaseFlowGuard } from "@/components/reservations/PurchaseFlowGuard";
import { PageSection } from "@/components/ui/PageSection";
import { StateMessage } from "@/components/ui/StateMessage";

export default function CheckoutPage() {
  return (
    <ProtectedRoute>
      <PurchaseFlowGuard>
        <PageSection
          description="Revise a compra, escolha a forma de pagamento e finalize seu pedido com mensagens claras de carregamento e erro."
          eyebrow="Pagamento"
          title="Finalizar compra"
        >
          <div className="panel-grid">
            <article className="panel">
              <h2 className="panel-title">Cartão de crédito</h2>
              <p className="panel-copy">
                Opção preparada para pagamento com cartão.
              </p>
            </article>
            <article className="panel">
              <h2 className="panel-title">PIX</h2>
              <p className="panel-copy">Opção preparada para pagamento via PIX.</p>
            </article>
            <article className="panel">
              <h2 className="panel-title">Resumo</h2>
              <p className="panel-copy">
                Filme, sessão, assentos e total ficarão reunidos aqui.
              </p>
            </article>
          </div>
          <StateMessage tone="error" title="Compra não iniciada">
            Se a reserva expirar ou o pedido não puder ser concluído, a mensagem
            será apresentada em português do Brasil.
          </StateMessage>
        </PageSection>
      </PurchaseFlowGuard>
    </ProtectedRoute>
  );
}
