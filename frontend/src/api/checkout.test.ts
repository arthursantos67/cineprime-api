import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, setApiAuthController } from "./client";
import { checkoutApi } from "./checkout";

const checkoutResponse = {
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
      movie: {
        id: "movie-1",
        title: "O Filme",
      },
      payment_method: "pix",
      room: {
        id: "room-1",
        name: "Sala 1",
      },
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

test("checkoutApi posts the typed checkout payload to the authenticated endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    setApiAuthController({
      getAccessToken: () => "access-token",
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/reservation/checkout/");
      assert.equal(init?.method, "POST");
      assert.equal(
        init?.body,
        JSON.stringify({
          payment_method: "pix",
          seats: [
            {
              session_seat_id: "session-seat-1",
              ticket_type: "inteira",
            },
          ],
        })
      );
      assert.equal(
        Object.hasOwn(JSON.parse(String(init?.body)), "total_amount"),
        false
      );

      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer access-token");
      assert.equal(headers.get("Content-Type"), "application/json");

      return Response.json(checkoutResponse);
    };

    const response = await checkoutApi.checkout({
      payment_method: "pix",
      seats: [
        {
          session_seat_id: "session-seat-1",
          ticket_type: "inteira",
        },
      ],
    });

    assert.deepEqual(response, checkoutResponse);
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});

test("checkoutApi preserves backend error codes for friendly checkout errors", async () => {
  const originalFetch = globalThis.fetch;

  try {
    setApiAuthController({
      getAccessToken: () => "access-token",
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = async () =>
      Response.json(
        {
          error: {
            code: "INVALID_PAYMENT_METHOD",
            details: {},
            message: "Unrecognized payment_method value.",
            status: 400,
          },
        },
        { status: 400 }
      );

    await assert.rejects(
      checkoutApi.checkout({
        payment_method: "pix",
        seats: [
          {
            session_seat_id: "session-seat-1",
            ticket_type: "inteira",
          },
        ],
      }),
      (error) =>
        error instanceof ApiError && error.code === "INVALID_PAYMENT_METHOD"
    );
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});

test("checkoutApi rejects unexpected checkout responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    setApiAuthController({
      getAccessToken: () => "access-token",
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = async () => Response.json({ status: "PURCHASED" });

    await assert.rejects(
      checkoutApi.checkout({
        payment_method: "pix",
        seats: [
          {
            session_seat_id: "session-seat-1",
            ticket_type: "inteira",
          },
        ],
      }),
      /Unexpected checkout response/
    );
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});
