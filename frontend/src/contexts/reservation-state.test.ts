import assert from "node:assert/strict";
import test from "node:test";

import type { ReservedSeat } from "@/types/reservation";

import {
  addSeatsToReservation,
  clearReservationExpirationNotice,
  expireReservation,
  initialReservationState,
  removeSeatFromReservation,
  resetReservation,
  setReservationPaymentMethod,
  setReservationTicketType,
  storeCheckoutResult,
} from "./reservation-state";

const firstSeat: ReservedSeat = {
  basePrice: 42.5,
  expiresAt: new Date("2026-05-22T21:40:00.000Z"),
  isAccessible: false,
  number: 7,
  row: "B",
  seatId: "seat-1",
  sessionSeatId: "session-seat-1",
};

const secondSeat: ReservedSeat = {
  basePrice: 42.5,
  expiresAt: new Date("2026-05-22T21:35:00.000Z"),
  isAccessible: true,
  number: 8,
  row: "B",
  seatId: "seat-2",
  sessionSeatId: "session-seat-2",
};

test("reservation state starts without persisted purchase data", () => {
  assert.deepEqual(initialReservationState, {
    checkoutResult: null,
    expirationNotice: null,
    expiredSessionId: null,
    paymentMethod: null,
    reservationExpiresAt: null,
    reservedSeats: [],
    sessionId: null,
    ticketTypes: {},
  });
});

test("addSeats preserves seat identifiers and applies default ticket types", () => {
  const state = addSeatsToReservation(
    initialReservationState,
    [firstSeat],
    "session-1"
  );

  assert.equal(state.sessionId, "session-1");
  assert.deepEqual(state.reservedSeats, [firstSeat]);
  assert.equal(state.reservedSeats[0].sessionSeatId, "session-seat-1");
  assert.equal(state.reservedSeats[0].seatId, "seat-1");
  assert.equal(state.ticketTypes["session-seat-1"], "inteira");
  assert.equal(state.reservationExpiresAt, firstSeat.expiresAt);
});

test("addSeats clears a previous in-memory checkout confirmation", () => {
  const checkedOut = storeCheckoutResult({
    payment_method: "pix",
    seats: [],
    status: "PURCHASED",
    tickets: [],
    total_amount: "0.00",
  });
  const state = addSeatsToReservation(checkedOut, [firstSeat], "session-1");

  assert.equal(state.checkoutResult, null);
  assert.deepEqual(state.reservedSeats, [firstSeat]);
});

test("addSeats can use a custom default ticket type and keeps the earliest expiration", () => {
  const state = addSeatsToReservation(
    addSeatsToReservation(initialReservationState, [firstSeat], "session-1"),
    [secondSeat],
    "session-1",
    "meia"
  );

  assert.deepEqual(state.reservedSeats, [firstSeat, secondSeat]);
  assert.equal(state.ticketTypes["session-seat-1"], "inteira");
  assert.equal(state.ticketTypes["session-seat-2"], "meia");
  assert.equal(state.reservationExpiresAt, secondSeat.expiresAt);
});

test("setTicketType only updates seats currently held in reservation state", () => {
  const state = addSeatsToReservation(
    initialReservationState,
    [firstSeat],
    "session-1"
  );
  const updated = setReservationTicketType(state, "session-seat-1", "meia");
  const unchanged = setReservationTicketType(updated, "unknown-seat", "inteira");

  assert.equal(updated.ticketTypes["session-seat-1"], "meia");
  assert.equal(unchanged, updated);
});

test("setPaymentMethod stores the selected checkout method", () => {
  const state = setReservationPaymentMethod(initialReservationState, "pix");

  assert.equal(state.paymentMethod, "pix");
});

test("removeSeat clears seat-specific ticket type and preserves remaining reservation data", () => {
  const state = setReservationPaymentMethod(
    addSeatsToReservation(
      initialReservationState,
      [firstSeat, secondSeat],
      "session-1"
    ),
    "cartao_credito"
  );
  const updated = removeSeatFromReservation(state, "session-seat-1");

  assert.deepEqual(updated.reservedSeats, [secondSeat]);
  assert.deepEqual(updated.ticketTypes, { "session-seat-2": "inteira" });
  assert.equal(updated.paymentMethod, "cartao_credito");
  assert.equal(updated.reservationExpiresAt, secondSeat.expiresAt);
  assert.equal(updated.sessionId, "session-1");
});

test("removeSeat recalculates expiration from remaining reserved seats", () => {
  const thirdSeat: ReservedSeat = {
    basePrice: 42.5,
    expiresAt: new Date("2026-05-22T21:50:00.000Z"),
    isAccessible: false,
    number: 9,
    row: "B",
    seatId: "seat-3",
    sessionSeatId: "session-seat-3",
  };
  const state = addSeatsToReservation(
    initialReservationState,
    [firstSeat, secondSeat, thirdSeat],
    "session-1"
  );

  assert.equal(state.reservationExpiresAt, secondSeat.expiresAt);

  const updated = removeSeatFromReservation(state, "session-seat-2");

  assert.deepEqual(updated.reservedSeats, [firstSeat, thirdSeat]);
  assert.equal(updated.reservationExpiresAt, firstSeat.expiresAt);
});

test("removeSeat clears the flow when the last seat is removed", () => {
  const state = setReservationPaymentMethod(
    addSeatsToReservation(initialReservationState, [firstSeat], "session-1"),
    "pix"
  );
  const updated = removeSeatFromReservation(state, "session-seat-1");

  assert.deepEqual(updated, initialReservationState);
});

test("resetReservation clears selected seats, ticket types, payment method, and expiration", () => {
  const state = setReservationPaymentMethod(
    addSeatsToReservation(initialReservationState, [firstSeat], "session-1"),
    "pix"
  );

  assert.notDeepEqual(state, initialReservationState);
  assert.deepEqual(resetReservation(), initialReservationState);
});

test("storeCheckoutResult keeps generated tickets in memory and clears active order state", () => {
  const checkoutResult = {
    payment_method: "pix" as const,
    seats: [
      {
        amount_paid: "42.50",
        number: 7,
        row: "B",
        seat_id: "seat-1",
        session_seat_id: "session-seat-1",
        status: "PURCHASED" as const,
        ticket_type: "inteira" as const,
      },
    ],
    status: "PURCHASED",
    tickets: [
      {
        amount_paid: "42.50",
        movie: { id: "movie-1", title: "O Filme" },
        payment_method: "pix" as const,
        room: { id: "room-1", name: "Sala 1" },
        seat: {
          id: "seat-1",
          identifier: "B7",
          number: 7,
          row: "B",
        },
        seat_id: "seat-1",
        session: {
          end_time: "2026-05-22T23:00:00-03:00",
          id: "session-1",
          start_time: "2026-05-22T21:00:00-03:00",
        },
        session_seat_id: "session-seat-1",
        ticket_code: "ABC123",
        ticket_id: "ticket-1",
        ticket_type: "inteira" as const,
      },
    ],
    total_amount: "42.50",
  };

  assert.deepEqual(storeCheckoutResult(checkoutResult), {
    ...initialReservationState,
    checkoutResult,
  });
});

test("expireReservation clears purchase flow data and keeps a transient notice", () => {
  const state = setReservationPaymentMethod(
    addSeatsToReservation(initialReservationState, [firstSeat], "session-1"),
    "pix"
  );
  const expired = expireReservation(state, "Reserva expirada.");

  assert.deepEqual(expired, {
    ...initialReservationState,
    expirationNotice: "Reserva expirada.",
    expiredSessionId: "session-1",
  });
});

test("clearReservationExpirationNotice removes only transient expiration feedback", () => {
  const expired = {
    ...initialReservationState,
    expirationNotice: "Reserva expirada.",
    expiredSessionId: "session-1",
  };

  assert.deepEqual(
    clearReservationExpirationNotice(expired),
    initialReservationState
  );
});
