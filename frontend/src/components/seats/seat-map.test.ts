import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ApiError } from "@/api/client";
import type { SessionSeatMapItem } from "@/types/reservation";

import {
  buildReservedSeatsFromReservation,
  formatCountdownLabel,
  getSeatAccessibleLabel,
  getSeatInteractionErrorMessage,
  getSeatVisualState,
  groupSeatMapRows,
  markSeatsAsAvailableBySessionSeatIds,
  markSeatsAsReservedBySeatIds,
  restoreSeatSnapshots,
  SeatMapLegend,
  SeatMapLayout,
} from "./SeatMap";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function seat(
  overrides: Partial<SessionSeatMapItem> = {}
): SessionSeatMapItem {
  const row = overrides.row ?? "A";
  const number = overrides.number ?? 1;

  return {
    is_accessible: false,
    number,
    row,
    seat_id: `seat-${row}-${number}`,
    session_seat_id: `session-seat-${row}-${number}`,
    status: "AVAILABLE",
    ...overrides,
  };
}

test("seat map groups seats by row and orders seats by number", () => {
  const rows = groupSeatMapRows([
    seat({ number: 2, row: "B" }),
    seat({ number: 2, row: "A" }),
    seat({ number: 1, row: "A" }),
  ]);

  assert.deepEqual(
    rows.map((row) => ({
      rowLabel: row.rowLabel,
      seatNumbers: row.seats.map((rowSeat) => rowSeat.number),
    })),
    [
      { rowLabel: "A", seatNumbers: [1, 2] },
      { rowLabel: "B", seatNumbers: [2] },
    ]
  );
});

test("seat visual states distinguish available, selected, reserved, and purchased", () => {
  assert.equal(getSeatVisualState(seat(), new Set()), "available");
  assert.equal(
    getSeatVisualState(seat({ session_seat_id: "selected-seat" }), new Set(["selected-seat"])),
    "selected"
  );
  assert.equal(
    getSeatVisualState(
      seat({ reserved_by_current_user: true, status: "RESERVED" }),
      new Set()
    ),
    "selected"
  );
  assert.equal(getSeatVisualState(seat({ status: "RESERVED" }), new Set()), "reserved");
  assert.equal(getSeatVisualState(seat({ status: "PURCHASED" }), new Set()), "purchased");
});

test("seat map renders screen, row labels, seat numbers, and semantic states", () => {
  const html = renderToStaticMarkup(
    createElement(SeatMapLayout, {
      countdownLabel: null,
      seats: [
        seat({ number: 1, row: "A" }),
        seat({
          is_accessible: true,
          number: 2,
          row: "A",
          status: "AVAILABLE",
        }),
        seat({ number: 1, row: "B", status: "RESERVED" }),
        seat({ number: 2, row: "B", status: "PURCHASED" }),
        seat({
          number: 3,
          reserved_by_current_user: true,
          row: "B",
          status: "RESERVED",
        }),
      ],
    })
  );

  assert.match(html, /Tela/);
  assert.match(html, /Fundo da sala/);
  assert.match(html, /Fileira A/);
  assert.match(html, /Fileira B/);
  assert.match(html, /seat-map__seat--available/);
  assert.match(html, /seat-map__seat--accessible/);
  assert.match(html, /seat-map__seat--reserved/);
  assert.match(html, /seat-map__seat--purchased/);
  assert.match(html, /seat-map__seat--selected/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /aria-pressed="true"/);
});

test("seat map layout renders reservation summary and countdown", () => {
  const expiresAt = new Date("2026-05-22T21:40:00.000Z");
  const html = renderToStaticMarkup(
    createElement(SeatMapLayout, {
      countdownLabel: formatCountdownLabel(
        expiresAt,
        new Date("2026-05-22T21:35:30.000Z")
      ),
      reservedSeats: [
        {
          basePrice: 0,
          expiresAt,
          isAccessible: false,
          number: 7,
          row: "B",
          seatId: "seat-1",
          sessionSeatId: "session-seat-1",
        },
      ],
      seats: [seat({ number: 7, row: "B", session_seat_id: "session-seat-1" })],
    })
  );

  assert.match(html, /Reserva temporária/);
  assert.match(html, /1 assento reservado/);
  assert.match(html, /Expira em 04:30/);
  assert.match(html, /B7/);
  assert.match(html, /Continuar/);
});

test("seat legend explains every state in pt-BR", () => {
  const html = renderToStaticMarkup(createElement(SeatMapLegend));

  assert.match(html, /Legenda dos assentos/);
  assert.match(html, /Disponível/);
  assert.match(html, /Selecionado/);
  assert.match(html, /Reservado ou indisponível/);
  assert.match(html, /Comprado/);
  assert.match(html, /Acessível/);
});

test("seat accessible labels expose row, number, state, and accessible marker", () => {
  assert.equal(
    getSeatAccessibleLabel(seat({ number: 7, row: "C" }), "available"),
    "Assento C7, fileira C, número 7, Disponível."
  );
  assert.equal(
    getSeatAccessibleLabel(
      seat({ is_accessible: true, number: 8, row: "C" }),
      "selected"
    ),
    "Assento C8, fileira C, número 8, Selecionado, assento acessível."
  );
});

test("reserved seats built from reservation response preserve original session seat identifiers", () => {
  const expiresAt = "2026-05-22T18:40:00-03:00";
  const reservedSeats = buildReservedSeatsFromReservation(
    {
      expires_at: expiresAt,
      seats: [
        {
          number: 7,
          row: "B",
          seat_id: "seat-1",
          status: "RESERVED",
        },
      ],
      session_id: "session-1",
      status: "TEMPORARILY_RESERVED",
    },
    [
      seat({
        is_accessible: true,
        number: 7,
        row: "B",
        seat_id: "seat-1",
        session_seat_id: "session-seat-original",
      }),
    ]
  );

  assert.equal(reservedSeats[0].seatId, "seat-1");
  assert.equal(reservedSeats[0].sessionSeatId, "session-seat-original");
  assert.equal(reservedSeats[0].isAccessible, true);
  assert.equal(reservedSeats[0].expiresAt.toISOString(), "2026-05-22T21:40:00.000Z");
});

test("optimistic reservation and rollback only affect targeted seats", () => {
  const originalSeat = seat({
    number: 1,
    seat_id: "seat-1",
    session_seat_id: "session-seat-1",
  });
  const unrelatedSeat = seat({
    number: 2,
    seat_id: "seat-2",
    session_seat_id: "session-seat-2",
  });

  const optimisticSeats = markSeatsAsReservedBySeatIds(
    [originalSeat, unrelatedSeat],
    ["seat-1"],
    "2026-05-22T18:40:00-03:00"
  );

  assert.equal(optimisticSeats[0].status, "RESERVED");
  assert.equal(optimisticSeats[0].reserved_by_current_user, true);
  assert.equal(optimisticSeats[1], unrelatedSeat);

  const rolledBackSeats = restoreSeatSnapshots(optimisticSeats, [originalSeat]);

  assert.deepEqual(rolledBackSeats, [originalSeat, unrelatedSeat]);
});

test("release updates only released session seat identifiers", () => {
  const ownReservation = seat({
    reserved_by_current_user: true,
    seat_id: "seat-1",
    session_seat_id: "session-seat-1",
    status: "RESERVED",
  });
  const unrelatedReservation = seat({
    reserved_by_current_user: true,
    seat_id: "seat-2",
    session_seat_id: "session-seat-2",
    status: "RESERVED",
  });

  const updatedSeats = markSeatsAsAvailableBySessionSeatIds(
    [ownReservation, unrelatedReservation],
    ["session-seat-1"]
  );

  assert.equal(updatedSeats[0].status, "AVAILABLE");
  assert.equal(updatedSeats[0].reserved_by_current_user, false);
  assert.equal(updatedSeats[1], unrelatedReservation);
});

test("seat conflict errors use a friendly pt-BR message", () => {
  const message = getSeatInteractionErrorMessage(
    new ApiError("Conflict", 409, {
      code: "SEAT_ALREADY_RESERVED",
      details: {},
    })
  );

  assert.match(message, /assento/);
  assert.match(message, /reservado/);
  assert.doesNotMatch(message, /Conflict/);
});
