import { getCheckoutStepStates, type CheckoutStepKey } from "./checkout-steps";

type CheckoutStepIndicatorProps = {
  currentStep: CheckoutStepKey;
};

const stepStatusLabels = {
  completed: "concluída",
  current: "atual",
  upcoming: "pendente",
} as const;

export function CheckoutStepIndicator({
  currentStep,
}: CheckoutStepIndicatorProps) {
  const steps = getCheckoutStepStates(currentStep);

  return (
    <nav aria-label="Etapas da compra" className="checkout-steps">
      <ol className="checkout-steps__list">
        {steps.map((step) => (
          <li
            aria-current={step.status === "current" ? "step" : undefined}
            aria-label={`${step.label}, etapa ${step.position} de ${steps.length}, ${stepStatusLabels[step.status]}`}
            className={`checkout-steps__item checkout-steps__item--${step.status}`}
            key={step.key}
          >
            <span aria-hidden="true" className="checkout-steps__marker">
              {step.status === "completed" ? "✓" : step.position}
            </span>
            <span className="checkout-steps__label">{step.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
