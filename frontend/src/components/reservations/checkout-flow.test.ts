import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@/api/client";
import type { ReservedSeat } from "@/types/reservation";

import {
  CHECKOUT_EMPTY_ORDER_MESSAGE,
  CHECKOUT_PAYMENT_REQUIRED_MESSAGE,
  buildCheckoutPayload,
  getCheckoutErrorMessage,
  getCheckoutSubmitBlocker,
} from "./checkout-flow";

const seats: ReservedSeat[] = [
  {
    basePrice: 42.5,
    expiresAt: new Date("2026-05-22T21:40:00.000Z"),
    isAccessible: false,
    number: 7,
    row: "B",
    seatId: "seat-1",
    sessionSeatId: "session-seat-1",
  },
  {
    basePrice: 42.5,
    expiresAt: new Date("2026-05-22T21:40:00.000Z"),
    isAccessible: false,
    number: 8,
    row: "B",
    seatId: "seat-2",
    sessionSeatId: "session-seat-2",
  },
];

test("buildCheckoutPayload submits only session seat IDs, ticket types, and payment method", () => {
  const payload = buildCheckoutPayload({
    paymentMethod: "pix",
    reservedSeats: seats,
    ticketTypes: {
      "session-seat-1": "inteira",
      "session-seat-2": "meia",
    },
  });

  assert.deepEqual(payload, {
    payment_method: "pix",
    seats: [
      {
        session_seat_id: "session-seat-1",
        ticket_type: "inteira",
      },
      {
        session_seat_id: "session-seat-2",
        ticket_type: "meia",
      },
    ],
  });
  assert.equal(Object.hasOwn(payload, "total_amount"), false);
});

test("buildCheckoutPayload falls back to inteira for missing ticket type state", () => {
  const payload = buildCheckoutPayload({
    paymentMethod: "cartao_credito",
    reservedSeats: [seats[0]],
    ticketTypes: {},
  });

  assert.deepEqual(payload.seats, [
    {
      session_seat_id: "session-seat-1",
      ticket_type: "inteira",
    },
  ]);
});

test("getCheckoutSubmitBlocker requires seats and a selected payment method", () => {
  assert.equal(
    getCheckoutSubmitBlocker({
      paymentMethod: "pix",
      reservedSeats: [],
    }),
    CHECKOUT_EMPTY_ORDER_MESSAGE
  );
  assert.equal(
    getCheckoutSubmitBlocker({
      paymentMethod: null,
      reservedSeats: [seats[0]],
    }),
    CHECKOUT_PAYMENT_REQUIRED_MESSAGE
  );
  assert.equal(
    getCheckoutSubmitBlocker({
      paymentMethod: "cartao_credito",
      reservedSeats: [seats[0]],
    }),
    null
  );
});

test("getCheckoutErrorMessage maps INVALID_TICKET_TYPE without exposing raw backend message", () => {
  const error = new ApiError("Invalid ticket type details.", 400, {
    code: "INVALID_TICKET_TYPE",
    details: {},
  });

  const message = getCheckoutErrorMessage(error);

  assert.doesNotMatch(message, /Invalid ticket type details/);
  assert.ok(message.length > 0);
});

test("getCheckoutErrorMessage maps INVALID_PAYMENT_METHOD without exposing raw backend message", () => {
  const error = new ApiError("Invalid payment method details.", 400, {
    code: "INVALID_PAYMENT_METHOD",
    details: {},
  });

  const message = getCheckoutErrorMessage(error);

  assert.doesNotMatch(message, /Invalid payment method details/);
  assert.ok(message.length > 0);
});

test("getCheckoutErrorMessage returns connection message for network errors preserving state", () => {
  const message = getCheckoutErrorMessage(new TypeError("Failed to fetch"));

  assert.match(message, /servidor/);
  assert.doesNotMatch(message, /Failed to fetch/);
});
