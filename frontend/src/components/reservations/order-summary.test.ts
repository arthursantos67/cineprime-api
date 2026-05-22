import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ReservedSeat } from "@/types/reservation";
import { formatCurrency } from "@/utils/formatters";

import { CheckoutStepIndicator } from "./CheckoutStepIndicator";
import { OrderSummaryPanel } from "./OrderSummaryPanel";
import { getCheckoutStepStates } from "./checkout-steps";
import {
  buildOrderSummaryItems,
  calculateOrderTotal,
  calculateTicketUnitPrice,
} from "./order-summary";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

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
  ...firstSeat,
  isAccessible: true,
  number: 8,
  seatId: "seat-2",
  sessionSeatId: "session-seat-2",
};

test("order summary helpers calculate full, half, and total values", () => {
  assert.equal(calculateTicketUnitPrice(42.5, "inteira"), 42.5);
  assert.equal(calculateTicketUnitPrice(42.5, "meia"), 21.25);

  const items = buildOrderSummaryItems(
    [firstSeat, secondSeat],
    {
      "session-seat-1": "inteira",
      "session-seat-2": "meia",
    }
  );

  assert.deepEqual(
    items.map((item) => ({
      seatLabel: item.seatLabel,
      ticketTypeLabel: item.ticketTypeLabel,
      unitPrice: item.unitPrice,
    })),
    [
      { seatLabel: "B7", ticketTypeLabel: "Inteira", unitPrice: 42.5 },
      { seatLabel: "B8", ticketTypeLabel: "Meia-entrada", unitPrice: 21.25 },
    ]
  );
  assert.equal(calculateOrderTotal(items), 63.75);
});

test("checkout step states mark completed, current, and upcoming steps", () => {
  const states = getCheckoutStepStates("ticket-types");

  assert.deepEqual(
    states.map((step) => [step.key, step.status]),
    [
      ["session", "completed"],
      ["seats", "completed"],
      ["ticket-types", "current"],
      ["checkout", "upcoming"],
      ["confirmation", "upcoming"],
    ]
  );
});

test("checkout step indicator identifies the current step semantically", () => {
  const html = renderToStaticMarkup(
    createElement(CheckoutStepIndicator, { currentStep: "checkout" })
  );

  assert.match(html, /Etapas da compra/);
  assert.match(html, /Sessão/);
  assert.match(html, /Pagamento/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /Pagamento, etapa 4 de 5, atual/);
});

test("order summary renders seats, ticket types, prices, total, and expiration", () => {
  const html = renderToStaticMarkup(
    createElement(OrderSummaryPanel, {
      actionHref: "/checkout",
      actionLabel: "Ir para pagamento",
      countdownLabel: "Expira em 04:30",
      countdownWarning: true,
      paymentMethod: "pix",
      reservationExpiresAt: firstSeat.expiresAt,
      reservedSeats: [firstSeat, secondSeat],
      ticketTypes: {
        "session-seat-1": "inteira",
        "session-seat-2": "meia",
      },
    })
  );

  assert.match(html, /Resumo do pedido/);
  assert.match(html, /Assento B7/);
  assert.match(html, /Inteira/);
  assert.match(html, /Assento B8/);
  assert.match(html, /Meia-entrada/);
  assert.match(html, /PIX/);
  assert.match(html, /Expira em 04:30/);
  assert.match(html, /order-summary__timer--warning/);
  assert.match(html, new RegExp(escapeRegExp(formatCurrency(63.75))));
  assert.match(html, /Ir para pagamento/);
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
