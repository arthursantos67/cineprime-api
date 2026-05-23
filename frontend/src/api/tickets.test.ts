import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "./client";
import { ticketsApi } from "./tickets";

const ticketsResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      amount_paid: "21.25",
      created_at: "2026-05-22T20:20:00-03:00",
      movie: {
        id: "movie-1",
        poster_url: "https://cdn.example.com/movie.jpg",
        title: "A Jornada",
      },
      payment_method: "pix",
      room: {
        id: "room-1",
        name: "Sala 1",
      },
      seat: {
        id: "seat-1",
        identifier: "A1",
        number: 1,
        row: "A",
      },
      session: {
        end_time: "2026-05-22T20:30:00-03:00",
        id: "session-1",
        start_time: "2026-05-22T18:30:00-03:00",
      },
      ticket_code: "ABC123",
      ticket_id: "ticket-1",
      ticket_type: "meia",
    },
  ],
};

test("ticketsApi lists authenticated user tickets through the canonical endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/users/me/tickets/");
      assert.equal(init?.method, "GET");

      return Response.json(ticketsResponse);
    };

    const response = await ticketsApi.listMyTickets();

    assert.deepEqual(response, ticketsResponse);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ticketsApi builds upcoming and past ticket filters", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  try {
    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return Response.json({ ...ticketsResponse, results: [] });
    };

    await ticketsApi.listMyTickets({ type: "upcoming" });
    await ticketsApi.listMyTickets({ type: "past" });

    assert.deepEqual(requestedUrls, [
      "http://localhost:8000/api/v1/users/me/tickets/?type=upcoming",
      "http://localhost:8000/api/v1/users/me/tickets/?type=past",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ticketsApi surfaces backend error codes through ApiError", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      Response.json(
        {
          error: {
            code: "NOT_AUTHENTICATED",
            details: {},
            message: "Authentication credentials were not provided.",
            status: 401,
          },
        },
        { status: 401 }
      );

    await assert.rejects(ticketsApi.listMyTickets(), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "NOT_AUTHENTICATED");
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ticketsApi rejects unexpected ticket list responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      Response.json({ ...ticketsResponse, results: [{ ticket_id: "ticket-1" }] });

    await assert.rejects(
      ticketsApi.listMyTickets(),
      /Unexpected my tickets response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
