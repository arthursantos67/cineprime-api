import assert from "node:assert/strict";
import test from "node:test";

import type { CatalogSession } from "@/types/catalog";

import {
  buildSessionDateOptions,
  formatDateForSessionQuery,
  formatSessionDateLabel,
  formatSessionFullDate,
  formatSessionPrice,
  formatSessionTime,
  getSessionSeatsHref,
  groupSessionsByRoom,
} from "./session-selection";

const movie = {
  duration_minutes: 125,
  genres: [{ id: "genre-1", name: "Aventura" }],
  id: "movie-123",
  is_featured: false,
  poster_url: "https://cdn.example.com/movie.jpg",
  status: "em_cartaz" as const,
  title: "A Jornada",
};

function session(
  id: string,
  room: { id: string; name: string },
  start_time: string,
  base_price = "42.50"
): CatalogSession {
  return {
    base_price,
    end_time: "2026-05-22T21:00:00-03:00",
    id,
    movie,
    room: {
      capacity: 80,
      ...room,
    },
    start_time,
  };
}

test("session date helpers use API and Brazilian display formats", () => {
  assert.equal(
    formatDateForSessionQuery(new Date("2026-05-22T10:30:00-03:00")),
    "2026-05-22"
  );
  assert.equal(formatSessionDateLabel("2026-05-22"), "22/05");
  assert.equal(formatSessionFullDate("2026-05-22"), "22 de maio de 2026");
  assert.equal(formatSessionTime("2026-05-22T18:30:00-03:00"), "18:30");
  assert.equal(formatSessionPrice("42.50"), "R$ 42,50");
});

test("session date options keep stable YYYY-MM-DD values", () => {
  assert.deepEqual(
    buildSessionDateOptions(new Date("2026-05-22T10:30:00-03:00"), 3).map(
      (option) => option.value
    ),
    ["2026-05-22", "2026-05-23", "2026-05-24"]
  );
});

test("groupSessionsByRoom groups by room and orders sessions by time", () => {
  const groups = groupSessionsByRoom([
    session("late-room-2", { id: "room-2", name: "Sala 2" }, "2026-05-22T21:00:00-03:00"),
    session("late-room-1", { id: "room-1", name: "Sala 1" }, "2026-05-22T20:00:00-03:00"),
    session("early-room-1", { id: "room-1", name: "Sala 1" }, "2026-05-22T18:30:00-03:00"),
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      roomName: group.roomName,
      sessionIds: group.sessions.map((groupedSession) => groupedSession.id),
    })),
    [
      { roomName: "Sala 1", sessionIds: ["early-room-1", "late-room-1"] },
      { roomName: "Sala 2", sessionIds: ["late-room-2"] },
    ]
  );
});

test("session navigation targets seat selection route", () => {
  assert.equal(getSessionSeatsHref("session-123"), "/sessions/session-123/seats");
});
