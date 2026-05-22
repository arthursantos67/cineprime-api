import type { ReactNode } from "react";

import { CheckoutStepIndicator } from "./CheckoutStepIndicator";
import { ReservationOrderSummary } from "./OrderSummaryPanel";
import type { CheckoutStepKey } from "./checkout-steps";

type PurchaseFlowLayoutProps = {
  children: ReactNode;
  currentStep: CheckoutStepKey;
  summaryActionHref?: string;
  summaryActionLabel?: string;
};

export function PurchaseFlowLayout({
  children,
  currentStep,
  summaryActionHref,
  summaryActionLabel,
}: PurchaseFlowLayoutProps) {
  return (
    <div className="purchase-flow">
      <CheckoutStepIndicator currentStep={currentStep} />
      <div className="purchase-flow__body">
        <div className="purchase-flow__primary">{children}</div>
        <div className="purchase-flow__summary">
          <ReservationOrderSummary
            actionHref={summaryActionHref}
            actionLabel={summaryActionLabel}
          />
        </div>
      </div>
    </div>
  );
}
