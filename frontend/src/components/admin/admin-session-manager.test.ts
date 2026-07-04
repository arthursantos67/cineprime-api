import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@/api/client";
import {
  addMinutesToLocalDateTime,
  combineLocalDateTime,
  extractSessionFieldErrors,
  getSessionPriceMultiplier,
  isConflictError,
  splitLocalDateTime,
} from "./session-utils";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const sessionMovie = {
  age_rating: null,
  cast: null,
  director: null,
  duration_minutes: 120,
  genres: [{ id: "genre-1", name: "Ação" }],
  id: "movie-1",
  is_featured: false,
  poster_url: "https://cdn.example.com/poster.jpg",
  release_date: "2026-06-01",
  status: "em_cartaz",
  title: "Filme Teste",
};

const sessionRoom = {
  capacity: 100,
  description: null,
  display_name: "Sala VIP Prime",
  experience_type: "vip",
  id: "room-1",
  name: "Sala 1",
};

const session = {
  audio_format: "legendado",
  base_price: "54.00",
  end_time: "2026-06-10T22:00:00Z",
  has_purchases: false,
  has_reservations: false,
  id: "session-1",
  movie: sessionMovie,
  projection_format: "3d",
  room: sessionRoom,
  session_type: "preview",
  start_time: "2026-06-10T19:30:00Z",
};

const paginatedSessions = {
  count: 1,
  next: null,
  previous: null,
  results: [session],
};

// ─── extractSessionFieldErrors ────────────────────────────────────────────────

test("extractSessionFieldErrors returns empty object for non-ApiError", () => {
  assert.deepEqual(extractSessionFieldErrors(new Error("network")), {});
  assert.deepEqual(extractSessionFieldErrors(null), {});
  assert.deepEqual(extractSessionFieldErrors(undefined), {});
});

test("extractSessionFieldErrors returns empty for non-validation ApiError", () => {
  const error = new ApiError("Not found", 404, {
    code: "RESOURCE_NOT_FOUND",
    details: { movie: ["Required."] },
  });
  assert.deepEqual(extractSessionFieldErrors(error), {});
});

test("extractSessionFieldErrors extracts field errors from VALIDATION_FAILED", () => {
  const error = new ApiError("Validation failed", 400, {
    code: "VALIDATION_FAILED",
    details: {
      end_time: ["O horário de fim deve ser após o início."],
      movie: ["Selecione um filme válido."],
    },
  });
  const result = extractSessionFieldErrors(error);
  assert.equal(result.end_time, "O horário de fim deve ser após o início.");
  assert.equal(result.movie, "Selecione um filme válido.");
});

test("extractSessionFieldErrors joins multiple messages per field", () => {
  const error = new ApiError("Validation failed", 400, {
    code: "VALIDATION_FAILED",
    details: {
      start_time: ["Campo obrigatório.", "Formato inválido."],
    },
  });
  const result = extractSessionFieldErrors(error);
  assert.equal(result.start_time, "Campo obrigatório. Formato inválido.");
});

test("extractSessionFieldErrors handles non_field_errors", () => {
  const error = new ApiError("Validation failed", 400, {
    code: "VALIDATION_FAILED",
    details: {
      non_field_errors: ["A sessão conflita com outra sessão na mesma sala."],
    },
  });
  assert.equal(
    extractSessionFieldErrors(error).non_field_errors,
    "A sessão conflita com outra sessão na mesma sala."
  );
});

test("extractSessionFieldErrors flattens per-date extra_dates conflicts", () => {
  const error = new ApiError("Validation failed", 400, {
    code: "VALIDATION_FAILED",
    details: {
      extra_dates: {
        "2026-03-25": {
          room: ["This room already has a session scheduled for the selected time range."],
        },
      },
    },
  });
  const result = extractSessionFieldErrors(error);
  assert.match(result.extra_dates ?? "", /2026-03-25/);
  assert.match(
    result.extra_dates ?? "",
    /This room already has a session scheduled for the selected time range\./
  );
});

// ─── adminApi.listSessions ─ integration-style ────────────────────────────────

import { adminApi } from "@/api/admin";

test("adminApi.listSessions returns sessions with movie and room", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json(paginatedSessions);
    const result = await adminApi.listSessions();
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].movie.title, "Filme Teste");
    assert.equal(result.results[0].room.id, "room-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.listSessions supports date, movie, and room filters", async () => {
  const originalFetch = globalThis.fetch;
  let captured = "";
  try {
    globalThis.fetch = async (input) => {
      captured = String(input);
      return Response.json({ count: 0, next: null, previous: null, results: [] });
    };
    await adminApi.listSessions({
      date: "2026-06-10",
      movie: "movie-1",
      room: "room-1",
    });
    assert.match(captured, /date=2026-06-10/);
    assert.match(captured, /movie=movie-1/);
    assert.match(captured, /room=room-1/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.createSession includes all metadata fields", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(init?.body as string);
      assert.equal(body.audio_format, "legendado");
      assert.equal(body.projection_format, "3d");
      assert.equal(body.session_type, "preview");
      return Response.json(session);
    };
    await adminApi.createSession({
      audio_format: "legendado",
      end_time: "2026-06-10T22:00:00Z",
      movie: "movie-1",
      projection_format: "3d",
      room: "room-1",
      session_type: "preview",
      start_time: "2026-06-10T19:30:00Z",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.updateSession only sends the changed field", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(init?.body as string);
      assert.deepEqual(Object.keys(body), ["audio_format"]);
      return Response.json({ ...session, audio_format: "dublado" });
    };
    await adminApi.updateSession("session-1", { audio_format: "dublado" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.deleteSession does not throw on 204 response", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 204 });
    await assert.doesNotReject(adminApi.deleteSession("session-1"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.getSession rejects when movie or room is missing", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({
        base_price: "54.00",
        end_time: "2026-06-10T22:00:00Z",
        id: "session-1",
        start_time: "2026-06-10T19:30:00Z",
      });
    await assert.rejects(
      adminApi.getSession("session-1"),
      /Unexpected admin session detail response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── splitLocalDateTime ────────────────────────────────────────────────────────

test("splitLocalDateTime splits an ISO string into local date and time parts", () => {
  // Both sides use local-time arithmetic (Date constructor + getFullYear/getMonth/...),
  // so they cancel out — the result is TZ-stable without any fixed-offset trick.
  const d = new Date(2026, 5, 10, 19, 30); // June 10 2026, 19:30 local
  const iso = d.toISOString();
  // Re-derive expected parts the same way the helper does
  const pad = (n: number) => String(n).padStart(2, "0");
  const expectedDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const expectedTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const result = splitLocalDateTime(iso);
  assert.equal(result.date, expectedDate);
  assert.equal(result.time, expectedTime);
});

// ─── combineLocalDateTime ─────────────────────────────────────────────────────

test("combineLocalDateTime round-trips through splitLocalDateTime", () => {
  const d = new Date(2026, 5, 10, 19, 30);
  const { date, time } = splitLocalDateTime(d.toISOString());
  const combined = combineLocalDateTime(date, time);
  const recovered = new Date(combined);
  assert.equal(recovered.getFullYear(), d.getFullYear());
  assert.equal(recovered.getMonth(), d.getMonth());
  assert.equal(recovered.getDate(), d.getDate());
  assert.equal(recovered.getHours(), d.getHours());
  assert.equal(recovered.getMinutes(), d.getMinutes());
});

// ─── addMinutesToLocalDateTime ────────────────────────────────────────────────

test("addMinutesToLocalDateTime adds minutes that stay within the same day", () => {
  const result = addMinutesToLocalDateTime("2026-06-10", "19:30", 120);
  assert.equal(result.time, "21:30");
  assert.equal(result.date, "2026-06-10");
});

test("addMinutesToLocalDateTime rolls over midnight correctly", () => {
  const result = addMinutesToLocalDateTime("2026-06-10", "23:00", 90);
  assert.equal(result.date, "2026-06-11");
  assert.equal(result.time, "00:30");
});

test("addMinutesToLocalDateTime handles zero-minute addition", () => {
  const result = addMinutesToLocalDateTime("2026-06-10", "15:00", 0);
  assert.equal(result.date, "2026-06-10");
  assert.equal(result.time, "15:00");
});

// ─── auto end-time pipeline ───────────────────────────────────────────────────

test("auto end-time: 120-min movie at 19:30 produces 21:30 end, same day", () => {
  const { date, time } = addMinutesToLocalDateTime("2026-07-01", "19:30", 120);
  const endIso = combineLocalDateTime(date, time);
  const recovered = splitLocalDateTime(endIso);
  assert.equal(recovered.date, "2026-07-01");
  assert.equal(recovered.time, "21:30");
});

test("auto end-time: midnight overflow submits next-day ISO correctly", () => {
  const { date, time } = addMinutesToLocalDateTime("2026-07-01", "23:00", 90);
  const endIso = combineLocalDateTime(date, time);
  const recovered = splitLocalDateTime(endIso);
  assert.equal(recovered.date, "2026-07-02");
  assert.equal(recovered.time, "00:30");
});

// ─── isConflictError ─────────────────────────────────────────────────────────

test("isConflictError returns true for 409 status", () => {
  assert.equal(
    isConflictError(new ApiError("Conflict", 409, { code: "CONFLICT", details: null })),
    true
  );
});

test("isConflictError returns true for 400 with overlap keyword", () => {
  assert.equal(
    isConflictError(new ApiError("Session overlap detected", 400, { code: "VALIDATION_FAILED", details: null })),
    true
  );
});

test("isConflictError returns true for 400 with Portuguese conflict phrase", () => {
  assert.equal(
    isConflictError(new ApiError("Conflito de horário com outra sessão já existe.", 400, { code: "VALIDATION_FAILED", details: null })),
    true
  );
});

test("isConflictError returns false for generic 400 validation error", () => {
  assert.equal(
    isConflictError(new ApiError("Validation failed", 400, { code: "VALIDATION_FAILED", details: null })),
    false
  );
});

test("isConflictError returns false for non-ApiError", () => {
  assert.equal(isConflictError(new Error("network error")), false);
  assert.equal(isConflictError(null), false);
});

// ─── getSessionPriceMultiplier ───────────────────────────────────────────────

test("getSessionPriceMultiplier returns 1.0 on a weekday (Wednesday)", () => {
  // 2026-07-01 is a Wednesday
  assert.equal(getSessionPriceMultiplier("2026-07-01", "19:30"), 1.0);
});

test("getSessionPriceMultiplier returns 1.24 on Friday", () => {
  // 2026-07-03 is a Friday
  assert.equal(getSessionPriceMultiplier("2026-07-03", "19:30"), 1.24);
});

test("getSessionPriceMultiplier returns 1.24 on Saturday", () => {
  // 2026-07-04 is a Saturday
  assert.equal(getSessionPriceMultiplier("2026-07-04", "19:30"), 1.24);
});

test("getSessionPriceMultiplier returns 1.24 on Sunday", () => {
  // 2026-07-05 is a Sunday
  assert.equal(getSessionPriceMultiplier("2026-07-05", "19:30"), 1.24);
});
