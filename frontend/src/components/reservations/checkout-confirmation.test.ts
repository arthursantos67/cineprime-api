import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TicketCard, buildDisplayOnlyBars } from "@/components/tickets/TicketCard";
import type { CheckoutResponse } from "@/types/reservation";

import { CheckoutConfirmationContent } from "./CheckoutConfirmation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const checkoutResult: CheckoutResponse = {
  payment_method: "pix",
  seats: [
    {
      amount_paid: "42.50",
      number: 7,
      row: "B",
      seat_id: "seat-1",
      session_seat_id: "session-seat-1",
      status: "PURCHASED",
      ticket_type: "inteira",
    },
  ],
  status: "PURCHASED",
  tickets: [
    {
      amount_paid: "42.50",
      movie: { id: "movie-1", title: "A Jornada" },
      payment_method: "pix",
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
      ticket_type: "inteira",
    },
  ],
  total_amount: "42.50",
};

test("ticket card renders generated ticket details and a display-only visual code", () => {
  const html = renderToStaticMarkup(
    createElement(TicketCard, { ticket: checkoutResult.tickets[0] })
  );

  assert.match(html, /A Jornada/);
  assert.match(html, /22\/05\/2026, 21:00/);
  assert.match(html, /Sala 1/);
  assert.match(html, /B7/);
  assert.match(html, /Inteira/);
  assert.match(html, /R\$\s?42,50/);
  assert.match(html, /PIX/);
  assert.match(html, /ABC123/);
  assert.match(html, /Representação visual do ingresso ABC123/);
  assert.match(html, /ticket-card__barcode-bar/);
});

test("display-only bars are deterministic and do not encode fake ticket data", () => {
  assert.deepEqual(buildDisplayOnlyBars("ABC123"), buildDisplayOnlyBars("ABC123"));
  assert.notDeepEqual(buildDisplayOnlyBars("ABC123"), buildDisplayOnlyBars("XYZ987"));
});

test("checkout confirmation renders the success state and generated tickets", () => {
  const html = renderToStaticMarkup(
    createElement(CheckoutConfirmationContent, { checkoutResult })
  );

  assert.match(html, /Compra confirmada/);
  assert.match(html, /Sua compra foi concluída com sucesso/);
  assert.match(html, /1 ingresso gerado/);
  assert.match(html, /R\$\s?42,50/);
  assert.match(html, /A Jornada/);
  assert.match(html, /ABC123/);
  assert.match(html, /href="\/my-tickets"/);
});

test("checkout confirmation reload fallback guides users to my tickets without fake tickets", () => {
  const html = renderToStaticMarkup(
    createElement(CheckoutConfirmationContent, { checkoutResult: null })
  );

  assert.match(html, /Confirmação indisponível/);
  assert.match(html, /página foi recarregada/);
  assert.match(html, /href="\/my-tickets"/);
  assert.doesNotMatch(html, /A Jornada/);
  assert.doesNotMatch(html, /ABC123/);
});
