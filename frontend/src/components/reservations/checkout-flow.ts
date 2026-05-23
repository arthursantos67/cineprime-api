import { getApiErrorUserMessage } from "@/api/client";
import { DEFAULT_TICKET_TYPE } from "@/contexts/reservation-state";
import type {
  CheckoutPayload,
  PaymentMethod,
  ReservedSeat,
  TicketType,
} from "@/types/reservation";

export const CHECKOUT_PAYMENT_REQUIRED_MESSAGE =
  "Escolha uma forma de pagamento para finalizar a compra.";

export const CHECKOUT_EMPTY_ORDER_MESSAGE =
  "Selecione ao menos um assento antes de finalizar a compra.";

export function buildCheckoutPayload({
  paymentMethod,
  reservedSeats,
  ticketTypes,
}: {
  paymentMethod: PaymentMethod;
  reservedSeats: ReservedSeat[];
  ticketTypes: Record<string, TicketType>;
}): CheckoutPayload {
  return {
    payment_method: paymentMethod,
    seats: reservedSeats.map((seat) => ({
      session_seat_id: seat.sessionSeatId,
      ticket_type: ticketTypes[seat.sessionSeatId] ?? DEFAULT_TICKET_TYPE,
    })),
  };
}

export function getCheckoutSubmitBlocker({
  paymentMethod,
  reservedSeats,
}: {
  paymentMethod: PaymentMethod | null;
  reservedSeats: ReservedSeat[];
}) {
  if (reservedSeats.length === 0) {
    return CHECKOUT_EMPTY_ORDER_MESSAGE;
  }

  if (!paymentMethod) {
    return CHECKOUT_PAYMENT_REQUIRED_MESSAGE;
  }

  return null;
}

export function getCheckoutErrorMessage(error: unknown) {
  return getApiErrorUserMessage(error);
}
