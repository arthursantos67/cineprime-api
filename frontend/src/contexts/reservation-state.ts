import type {
  CheckoutResponse,
  PaymentMethod,
  ReservedSeat,
  TicketType,
} from "@/types/reservation";

export type ReservationState = {
  checkoutResult: CheckoutResponse | null;
  expirationNotice: string | null;
  expiredSessionId: string | null;
  sessionId: string | null;
  reservedSeats: ReservedSeat[];
  ticketTypes: Record<string, TicketType>;
  paymentMethod: PaymentMethod | null;
  reservationExpiresAt: Date | null;
};

export const DEFAULT_TICKET_TYPE: TicketType = "inteira";

export const initialReservationState: ReservationState = {
  checkoutResult: null,
  expirationNotice: null,
  expiredSessionId: null,
  paymentMethod: null,
  reservationExpiresAt: null,
  reservedSeats: [],
  sessionId: null,
  ticketTypes: {},
};

export function addSeatsToReservation(
  state: ReservationState,
  seats: ReservedSeat[],
  sessionId = state.sessionId,
  defaultTicketType: TicketType = DEFAULT_TICKET_TYPE
): ReservationState {
  const nextSeatsById = new Map(
    state.reservedSeats.map((seat) => [seat.sessionSeatId, seat])
  );
  const nextTicketTypes = { ...state.ticketTypes };
  let nextExpiresAt = state.reservationExpiresAt;

  for (const seat of seats) {
    nextSeatsById.set(seat.sessionSeatId, seat);
    nextTicketTypes[seat.sessionSeatId] ??= defaultTicketType;

    if (!nextExpiresAt || seat.expiresAt < nextExpiresAt) {
      nextExpiresAt = seat.expiresAt;
    }
  }

  return {
    ...state,
    checkoutResult: null,
    expirationNotice: null,
    expiredSessionId: null,
    reservationExpiresAt: nextExpiresAt,
    reservedSeats: Array.from(nextSeatsById.values()),
    sessionId: sessionId ?? state.sessionId,
    ticketTypes: nextTicketTypes,
  };
}

export function removeSeatFromReservation(
  state: ReservationState,
  sessionSeatId: string
): ReservationState {
  const ticketTypes = { ...state.ticketTypes };
  delete ticketTypes[sessionSeatId];
  const reservedSeats = state.reservedSeats.filter(
    (seat) => seat.sessionSeatId !== sessionSeatId
  );
  const reservationExpiresAt = getEarliestExpiration(reservedSeats);

  return {
    ...state,
    paymentMethod: reservedSeats.length === 0 ? null : state.paymentMethod,
    reservationExpiresAt,
    reservedSeats,
    sessionId: reservedSeats.length === 0 ? null : state.sessionId,
    ticketTypes,
  };
}

export function setReservationTicketType(
  state: ReservationState,
  sessionSeatId: string,
  type: TicketType
): ReservationState {
  if (!state.reservedSeats.some((seat) => seat.sessionSeatId === sessionSeatId)) {
    return state;
  }

  return {
    ...state,
    ticketTypes: {
      ...state.ticketTypes,
      [sessionSeatId]: type,
    },
  };
}

export function setReservationPaymentMethod(
  state: ReservationState,
  method: PaymentMethod
): ReservationState {
  return {
    ...state,
    paymentMethod: method,
  };
}

export function storeCheckoutResult(
  checkoutResult: CheckoutResponse
): ReservationState {
  return {
    ...initialReservationState,
    checkoutResult,
  };
}

export function resetReservation(): ReservationState {
  return { ...initialReservationState };
}

export function expireReservation(
  state: ReservationState,
  message: string
): ReservationState {
  return {
    ...initialReservationState,
    expirationNotice: message,
    expiredSessionId: state.sessionId,
  };
}

export function clearReservationExpirationNotice(
  state: ReservationState
): ReservationState {
  if (!state.expirationNotice && !state.expiredSessionId) {
    return state;
  }

  return {
    ...state,
    expirationNotice: null,
    expiredSessionId: null,
  };
}

function getEarliestExpiration(seats: ReservedSeat[]) {
  return (
    seats
      .map((seat) => seat.expiresAt)
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? null
  );
}
