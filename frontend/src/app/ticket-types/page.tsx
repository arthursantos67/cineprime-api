import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PurchaseFlowLayout } from "@/components/reservations/PurchaseFlowLayout";
import { PurchaseFlowGuard } from "@/components/reservations/PurchaseFlowGuard";
import { PageSection } from "@/components/ui/PageSection";
import { StateMessage } from "@/components/ui/StateMessage";
import { formatCurrency } from "@/utils/formatters";

export default function TicketTypeSelectionPage() {
  return (
    <ProtectedRoute>
      <PurchaseFlowGuard>
        <PageSection
          description={`Escolha entre inteira e meia-entrada. A exibição de valores já usa o padrão ${formatCurrency(42.5)}.`}
          eyebrow="Ingressos"
          title="Tipos de ingresso"
        >
          <PurchaseFlowLayout
            currentStep="ticket-types"
            summaryActionHref="/checkout"
            summaryActionLabel="Ir para pagamento"
          >
            <div className="panel-grid">
              <article className="panel">
                <h2 className="panel-title">Inteira</h2>
                <p className="panel-copy">Valor cheio da sessão selecionada.</p>
              </article>
              <article className="panel">
                <h2 className="panel-title">Meia-entrada</h2>
                <p className="panel-copy">
                  Metade do valor base, conforme regras aplicáveis.
                </p>
              </article>
              <article className="panel">
                <h2 className="panel-title">Cupom</h2>
                <p className="panel-copy">
                  Campo preparado para validação em etapa futura.
                </p>
              </article>
            </div>
            <StateMessage tone="loading" title="Seleção de assentos necessária">
              Os tipos de ingresso serão calculados depois que os assentos forem
              reservados.
            </StateMessage>
          </PurchaseFlowLayout>
        </PageSection>
      </PurchaseFlowGuard>
    </ProtectedRoute>
  );
}
