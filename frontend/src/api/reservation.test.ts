import assert from "node:assert/strict";
import test from "node:test";

import { setApiAuthController } from "./client";
import { reservationApi } from "./reservation";

const seatMapResponse = [
  {
    is_accessible: false,
    lock_expires_at: null,
    number: 7,
    reserved_by_current_user: false,
    row: "B",
    seat_id: "seat-1",
    session_seat_id: "session-seat-1",
    status: "AVAILABLE",
  },
];

const reservationResponse = {
  expires_at: "2026-05-22T18:40:00-03:00",
  seats: [
    {
      number: 7,
      row: "B",
      seat_id: "seat-1",
      status: "RESERVED",
    },
  ],
  session_id: "session-1",
  status: "RESERVED",
};

const releaseResponse = {
  seats: [
    {
      is_accessible: false,
      number: 7,
      row: "B",
      seat_id: "seat-1",
      session_seat_id: "session-seat-1",
      status: "AVAILABLE",
    },
  ],
  session_id: "session-1",
  status: "RELEASED",
};

test("reservationApi fetches a public session seat map", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/reservation/sessions/session-1/seats/"
      );
      assert.equal(init?.method, "GET");

      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), null);

      return Response.json(seatMapResponse);
    };

    const response = await reservationApi.getSeatMap("session-1");

    assert.deepEqual(response, seatMapResponse);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reservationApi submits seat_ids to the authenticated temporary reservation endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    setApiAuthController({
      getAccessToken: () => "access-token",
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = async (input, init) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/reservation/sessions/session-1/reservations/"
      );
      assert.equal(init?.method, "POST");
      assert.equal(init?.body, JSON.stringify({ seat_ids: ["seat-1"] }));

      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer access-token");
      assert.equal(headers.get("Content-Type"), "application/json");

      return Response.json(reservationResponse, { status: 201 });
    };

    const response = await reservationApi.reserveSeats("session-1", ["seat-1"]);

    assert.deepEqual(response, reservationResponse);
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});

test("reservationApi submits session_seat_ids to release current user reservations", async () => {
  const originalFetch = globalThis.fetch;

  try {
    setApiAuthController({
      getAccessToken: () => "access-token",
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = async (input, init) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/reservation/sessions/session-1/reservations/"
      );
      assert.equal(init?.method, "DELETE");
      assert.equal(
        init?.body,
        JSON.stringify({ session_seat_ids: ["session-seat-1"] })
      );

      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer access-token");

      return Response.json(releaseResponse);
    };

    const response = await reservationApi.releaseReservations("session-1", [
      "session-seat-1",
    ]);

    assert.deepEqual(response, releaseResponse);
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});

test("reservationApi rejects unexpected reservation responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({ session_id: "session-1" });

    await assert.rejects(
      reservationApi.getSeatMap("session-1"),
      /Unexpected reservation seat map response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
