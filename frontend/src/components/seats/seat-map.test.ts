import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SessionSeatMapItem } from "@/types/reservation";

import {
  getSeatAccessibleLabel,
  getSeatVisualState,
  groupSeatMapRows,
  SeatMapLegend,
  SeatMapView,
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
    createElement(SeatMapView, {
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
