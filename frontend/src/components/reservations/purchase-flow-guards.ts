export const PURCHASE_FLOW_EXPIRED_MESSAGE =
  "Sua reserva temporária expirou. Os assentos foram liberados; escolha seus lugares novamente para continuar a compra.";

export const PURCHASE_FLOW_MISSING_RESERVATION_MESSAGE =
  "Selecione seus assentos antes de continuar a compra.";

export type PurchaseFlowGuardDecision = {
  message: string | null;
  redirectPath: string | null;
  renderContent: boolean;
  shouldResetExpiredReservation: boolean;
  title: string | null;
};

type PurchaseFlowGuardInput = {
  hasReservedSeats: boolean;
  isExpired: boolean;
  sessionId: string | null;
};

export function getPurchaseFlowGuardDecision({
  hasReservedSeats,
  isExpired,
  sessionId,
}: PurchaseFlowGuardInput): PurchaseFlowGuardDecision {
  if (hasReservedSeats && isExpired) {
    return {
      message: PURCHASE_FLOW_EXPIRED_MESSAGE,
      redirectPath: buildSeatSelectionPath(sessionId),
      renderContent: false,
      shouldResetExpiredReservation: true,
      title: "Reserva expirada",
    };
  }

  if (!hasReservedSeats) {
    return {
      message: PURCHASE_FLOW_MISSING_RESERVATION_MESSAGE,
      redirectPath: null,
      renderContent: false,
      shouldResetExpiredReservation: false,
      title: "Reserva necessária",
    };
  }

  return {
    message: null,
    redirectPath: null,
    renderContent: true,
    shouldResetExpiredReservation: false,
    title: null,
  };
}

function buildSeatSelectionPath(sessionId: string | null) {
  return sessionId ? `/sessions/${encodeURIComponent(sessionId)}/seats` : "/";
}
