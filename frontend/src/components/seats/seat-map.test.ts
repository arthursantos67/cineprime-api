import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ApiError } from "@/api/client";
import type { SessionSeatMapItem } from "@/types/reservation";

import {
  buildSeatMapLayout,
  buildReservedSeatsFromReservation,
  getCenterAisleAfterIndex,
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
        ...Array.from({ length: 10 }, (_, index) =>
          seat({ number: index + 1, row: "C" })
        ),
      ],
    })
  );

  assert.match(html, /Tela/);
  assert.match(html, /Fundo da sala/);
  assert.ok(html.indexOf("Assentos acessíveis") < html.indexOf("Fileira A"));
  assert.match(html, /Fileira A/);
  assert.match(html, /Fileira B/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-describedby="mapa-assentos-instrucoes"/);
  assert.match(html, /role="group"/);
  assert.match(html, /seat-map__seat--available/);
  assert.match(html, /seat-map__seat--accessible/);
  assert.match(html, /seat-map__seat--reserved/);
  assert.match(html, /seat-map__seat--purchased/);
  assert.match(html, /seat-map__seat--selected/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Assento A2, fileira A, número 2, Disponível, assento acessível/);
  assert.equal((html.match(/seat-map__seat--accessible/g) ?? []).length, 6);
  assert.equal((html.match(/seat-map__seat--companion/g) ?? []).length, 6);
  assert.match(html, />AC</);
  assert.match(html, /Acompanhante/);
  assert.doesNotMatch(html, /seat-map__seat-marker">L/);
  assert.doesNotMatch(html, /seat-map__seat-marker">S/);
  assert.doesNotMatch(html, /accessible-placeholder/);
});

test("seat map layout moves accessible seats and companions before the first row", () => {
  const layout = buildSeatMapLayout([
    seat({ is_accessible: true, number: 9, row: "C" }),
    seat({ is_accessible: true, number: 10, row: "C" }),
    seat({ is_accessible: true, number: 11, row: "C" }),
    seat({ is_accessible: true, number: 12, row: "C" }),
    seat({ is_accessible: true, number: 13, row: "C" }),
    seat({ is_accessible: true, number: 14, row: "C" }),
    seat({ number: 1, row: "A" }),
    seat({ number: 2, row: "A" }),
    ...Array.from({ length: 6 }, (_, index) =>
      seat({ number: index + 15, row: "C" })
    ),
  ]);
  const accessiblePairs = [
    ...layout.accessibleLeftPairs,
    ...layout.accessibleRightPairs,
  ];

  assert.equal(layout.accessibleLeftPairs.length, 3);
  assert.equal(layout.accessibleRightPairs.length, 3);
  assert.deepEqual(
    accessiblePairs.map(
      (accessiblePair) => accessiblePair.accessibleSeat.seat.number
    ),
    [9, 10, 11, 12, 13, 14]
  );
  assert.deepEqual(
    accessiblePairs.map(
      (accessiblePair) => accessiblePair.accessibleSeat.displayNumber
    ),
    [1, 2, 3, 4, 5, 6]
  );
  assert.ok(accessiblePairs.every((accessiblePair) => accessiblePair.companionSeat));
  assert.deepEqual(
    layout.rows.map((row) => ({
      rowLabel: row.rowLabel,
      seatNumbers: row.seats.map((rowSeat) => rowSeat.number),
    })),
    [{ rowLabel: "A", seatNumbers: [1, 2] }]
  );
});

test("seat map layout fills missing priority positions with real selectable seats", () => {
  const layout = buildSeatMapLayout([
    ...Array.from({ length: 16 }, (_, index) =>
      seat({ number: index + 1, row: "A" })
    ),
    seat({ is_accessible: true, number: 17, row: "A" }),
  ]);
  const accessiblePairs = [
    ...layout.accessibleLeftPairs,
    ...layout.accessibleRightPairs,
  ];

  assert.equal(accessiblePairs.length, 6);
  assert.ok(
    accessiblePairs.every(
      (accessiblePair) => accessiblePair.accessibleSeat.seat.seat_id
    )
  );
  assert.ok(
    accessiblePairs.every(
      (accessiblePair) => accessiblePair.accessibleSeat.seat.is_accessible
    )
  );
  assert.deepEqual(
    accessiblePairs.map(
      (accessiblePair) => accessiblePair.accessibleSeat.displayNumber
    ),
    [1, 2, 3, 4, 5, 6]
  );
  assert.ok(accessiblePairs.every((accessiblePair) => accessiblePair.companionSeat));
  assert.equal(layout.rows[0].seats.length, 5);
});

test("seat map center aisle keeps rows with two extra seats symmetric", () => {
  assert.equal(getCenterAisleAfterIndex(4), -1);
  assert.equal(getCenterAisleAfterIndex(10), 4);
  assert.equal(getCenterAisleAfterIndex(12), 5);
});

test("seat map row split puts two extra seats one on each side", () => {
  const layout = buildSeatMapLayout([
    ...Array.from({ length: 12 }, (_, index) =>
      seat({ is_accessible: true, number: index + 1, row: "P" })
    ),
    ...Array.from({ length: 12 }, (_, index) =>
      seat({ number: index + 1, row: "Z" })
    ),
    ...Array.from({ length: 9 }, (_, index) =>
      seat({ number: index + 1, row: "A" })
    ),
    ...Array.from({ length: 11 }, (_, index) =>
      seat({ number: index + 1, row: "B" })
    ),
  ]);
  const rowB = layout.rows.find((row) => row.rowLabel === "B");

  assert.ok(rowB);
  assert.deepEqual(
    rowB.leftSeats.map((rowSeat) => rowSeat.displayNumber),
    [1, 2, 3, 4, 5, 6]
  );
  assert.deepEqual(
    rowB.rightSeats.map((rowSeat) => rowSeat.displayNumber),
    [7, 8, 9, 10, 11]
  );
});

test("seat legend explains every state in pt-BR", () => {
  const html = renderToStaticMarkup(createElement(SeatMapLegend));

  assert.match(html, /<ul/);
  assert.match(html, /Legenda dos assentos/);
  assert.match(html, /Disponível/);
  assert.match(html, /Selecionado/);
  assert.match(html, /Reservado ou indisponível/);
  assert.match(html, /Comprado/);
  assert.match(html, /Acessível/);
  assert.doesNotMatch(
    html,
    /seat-map__legend-swatch seat-map__legend-swatch--selected">S/
  );
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
    ],
    42.5
  );

  assert.equal(reservedSeats[0].basePrice, 42.5);
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

test("seat interaction error for non-conflict API failures falls back to mapped message", () => {
  const message = getSeatInteractionErrorMessage(
    new ApiError("Internal Server Error", 500, {
      code: "INTERNAL_SERVER_ERROR",
      details: {},
    })
  );

  assert.doesNotMatch(message, /Internal Server Error/);
  assert.ok(message.length > 0);
});

test("seat interaction error for network failure returns connection message", () => {
  const message = getSeatInteractionErrorMessage(new TypeError("Failed to fetch"));

  assert.match(message, /servidor/);
  assert.doesNotMatch(message, /Failed to fetch/);
});

test("seat map layout renders empty state when room has no seats", () => {
  const html = renderToStaticMarkup(
    createElement(SeatMapLayout, { seats: [] })
  );

  assert.match(html, /Sala sem assentos/);
  assert.match(html, /Ainda não há assentos cadastrados/);
  assert.doesNotMatch(html, /seat-map__seat/);
});
