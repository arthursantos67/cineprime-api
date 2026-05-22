export const checkoutSteps = [
  { key: "session", label: "Sessão" },
  { key: "seats", label: "Assentos" },
  { key: "ticket-types", label: "Ingressos" },
  { key: "checkout", label: "Pagamento" },
  { key: "confirmation", label: "Confirmação" },
] as const;

export type CheckoutStepKey = (typeof checkoutSteps)[number]["key"];

export type CheckoutStepStatus = "completed" | "current" | "upcoming";

export type CheckoutStepState = (typeof checkoutSteps)[number] & {
  position: number;
  status: CheckoutStepStatus;
};

export function getCheckoutStepStates(
  currentStep: CheckoutStepKey
): CheckoutStepState[] {
  const currentIndex = checkoutSteps.findIndex((step) => step.key === currentStep);

  return checkoutSteps.map((step, index) => ({
    ...step,
    position: index + 1,
    status:
      index < currentIndex
        ? "completed"
        : index === currentIndex
          ? "current"
          : "upcoming",
  }));
}
