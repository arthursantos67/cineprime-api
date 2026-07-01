import assert from "node:assert/strict";
import test from "node:test";

import { adminApi } from "./admin";

const movieDetail = {
  age_rating: "12",
  cast: ["Actor One", "Actor Two"],
  created_at: "2026-05-20T10:00:00-03:00",
  director: "Director Name",
  duration_minutes: 120,
  genres: [{ id: "genre-1", name: "Ação" }],
  id: "movie-1",
  is_featured: true,
  poster_url: "https://cdn.example.com/poster.jpg",
  release_date: "2026-06-01",
  status: "em_cartaz",
  synopsis: "Uma sinopse.",
  title: "Filme Teste",
  updated_at: "2026-05-21T10:00:00-03:00",
};

const paginatedMovies = {
  count: 1,
  next: null,
  previous: null,
  results: [movieDetail],
};

const genre = {
  created_at: "2026-05-20T10:00:00-03:00",
  id: "genre-1",
  name: "Ação",
  updated_at: "2026-05-21T10:00:00-03:00",
};

const paginatedGenres = {
  count: 1,
  next: null,
  previous: null,
  results: [genre],
};

test("adminApi.listMovies fetches the paginated movie list", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/movies/");
      assert.equal(init?.method, "GET");

      return Response.json(paginatedMovies);
    };

    const response = await adminApi.listMovies();

    assert.equal(response.count, 1);
    assert.equal(response.results[0].title, "Filme Teste");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.listMovies builds status and search filters", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  try {
    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return Response.json({ count: 0, next: null, previous: null, results: [] });
    };

    await adminApi.listMovies({ status: "em_cartaz" });
    await adminApi.listMovies({ search: "Blade" });
    await adminApi.listMovies({ status: "pre_venda", search: "Runner", page: 2 });

    assert.deepEqual(requestedUrls, [
      "http://localhost:8000/api/v1/catalog/movies/?status=em_cartaz",
      "http://localhost:8000/api/v1/catalog/movies/?search=Blade",
      "http://localhost:8000/api/v1/catalog/movies/?status=pre_venda&search=Runner&page=2",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.getMovie fetches a single movie by id", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/movies/movie-1/");
      return Response.json(movieDetail);
    };

    const movie = await adminApi.getMovie("movie-1");

    assert.equal(movie.id, "movie-1");
    assert.equal(movie.title, "Filme Teste");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.createMovie posts the movie payload", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/movies/");
      assert.equal(init?.method, "POST");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.title, "Filme Teste");
      assert.deepEqual(body.genres, ["genre-1"]);
      assert.deepEqual(body.cast, ["Actor One"]);
      return Response.json(movieDetail);
    };

    await adminApi.createMovie({
      cast: ["Actor One"],
      duration_minutes: 120,
      genres: ["genre-1"],
      is_featured: true,
      poster_url: "https://cdn.example.com/poster.jpg",
      release_date: "2026-06-01",
      status: "em_cartaz",
      synopsis: "Uma sinopse.",
      title: "Filme Teste",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.createMovie posts trailer_url independently of spotlight_url", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/movies/");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.trailer_url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      assert.equal(body.spotlight_url, "https://cdn.example.com/spotlight.jpg");
      return Response.json({
        ...movieDetail,
        spotlight_url: body.spotlight_url,
        trailer_url: body.trailer_url,
      });
    };

    const created = await adminApi.createMovie({
      duration_minutes: 120,
      genres: ["genre-1"],
      poster_url: "https://cdn.example.com/poster.jpg",
      release_date: "2026-06-01",
      spotlight_url: "https://cdn.example.com/spotlight.jpg",
      status: "em_cartaz",
      synopsis: "Uma sinopse.",
      title: "Filme Teste",
      trailer_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    assert.equal(created.trailer_url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(created.spotlight_url, "https://cdn.example.com/spotlight.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.updateMovie patches the movie by id", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/movies/movie-1/");
      assert.equal(init?.method, "PATCH");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.is_featured, false);
      return Response.json({ ...movieDetail, is_featured: false });
    };

    const updated = await adminApi.updateMovie("movie-1", { is_featured: false });
    assert.equal(updated.is_featured, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.updateMovie can clear trailer_url without touching spotlight_url", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/movies/movie-1/");
      assert.equal(init?.method, "PATCH");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.trailer_url, null);
      assert.equal("spotlight_url" in body, false);
      return Response.json({ ...movieDetail, trailer_url: null });
    };

    const updated = await adminApi.updateMovie("movie-1", { trailer_url: null });
    assert.equal(updated.trailer_url, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.deleteMovie sends a DELETE request", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/movies/movie-1/");
      assert.equal(init?.method, "DELETE");
      return new Response(null, { status: 204 });
    };

    await adminApi.deleteMovie("movie-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.listGenres fetches the paginated genre list with auth", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/genres/");
      assert.equal(init?.method, "GET");
      return Response.json(paginatedGenres);
    };

    const response = await adminApi.listGenres();

    assert.equal(response.count, 1);
    assert.equal(response.results[0].name, "Ação");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.listGenres builds page param", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/genres/?page=2");
      return Response.json(paginatedGenres);
    };

    await adminApi.listGenres({ page: 2 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.createGenre posts the genre payload", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/genres/");
      assert.equal(init?.method, "POST");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.name, "Ação");
      return Response.json(genre);
    };

    const created = await adminApi.createGenre({ name: "Ação" });
    assert.equal(created.id, "genre-1");
    assert.equal(created.name, "Ação");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.updateGenre patches the genre by id", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/genres/genre-1/");
      assert.equal(init?.method, "PATCH");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.name, "Drama");
      return Response.json({ ...genre, name: "Drama" });
    };

    const updated = await adminApi.updateGenre("genre-1", { name: "Drama" });
    assert.equal(updated.name, "Drama");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.deleteGenre sends a DELETE request", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/genres/genre-1/");
      assert.equal(init?.method, "DELETE");
      return new Response(null, { status: 204 });
    };

    await adminApi.deleteGenre("genre-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.getMovie rejects unexpected response shape", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({ id: "movie-1" });

    await assert.rejects(
      adminApi.getMovie("movie-1"),
      /Unexpected admin movie detail response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.listMovies rejects non-paginated response", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json([]);

    await assert.rejects(
      adminApi.listMovies(),
      /Unexpected admin movie list response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.createGenre rejects unexpected response shape", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({});

    await assert.rejects(
      adminApi.createGenre({ name: "Ação" }),
      /Unexpected admin create genre response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── Session fixtures ─────────────────────────────────────────────────────────

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
  created_at: "2026-06-01T10:00:00Z",
  end_time: "2026-06-10T22:00:00Z",
  has_purchases: false,
  has_reservations: false,
  id: "session-1",
  movie: sessionMovie,
  projection_format: "3d",
  room: sessionRoom,
  seat_count: 48,
  session_type: "preview",
  start_time: "2026-06-10T19:30:00Z",
  updated_at: "2026-06-01T10:00:00Z",
};

const paginatedSessions = {
  count: 1,
  next: null,
  previous: null,
  results: [session],
};

// ─── adminApi.listSessions ────────────────────────────────────────────────────

test("adminApi.listSessions fetches the paginated session list", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/sessions/");
      return Response.json(paginatedSessions);
    };

    const response = await adminApi.listSessions();

    assert.equal(response.count, 1);
    assert.equal(response.results[0].id, "session-1");
    assert.equal(response.results[0].base_price, "54.00");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.listSessions builds date, movie, and room filters", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  try {
    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return Response.json({ count: 0, next: null, previous: null, results: [] });
    };

    await adminApi.listSessions({ date: "2026-06-10" });
    await adminApi.listSessions({ movie: "movie-1" });
    await adminApi.listSessions({ room: "room-1", page: 2 });
    await adminApi.listSessions({ date: "2026-06-10", movie: "movie-1", room: "room-1" });

    assert.deepEqual(requestedUrls, [
      "http://localhost:8000/api/v1/catalog/sessions/?date=2026-06-10",
      "http://localhost:8000/api/v1/catalog/sessions/?movie=movie-1",
      "http://localhost:8000/api/v1/catalog/sessions/?room=room-1&page=2",
      "http://localhost:8000/api/v1/catalog/sessions/?date=2026-06-10&movie=movie-1&room=room-1",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.listSessions rejects non-paginated response", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json([]);

    await assert.rejects(
      adminApi.listSessions(),
      /Unexpected admin session list response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── adminApi.getSession ──────────────────────────────────────────────────────

test("adminApi.getSession fetches a single session by id", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/catalog/sessions/session-1/"
      );
      return Response.json(session);
    };

    const result = await adminApi.getSession("session-1");

    assert.equal(result.id, "session-1");
    assert.equal(result.base_price, "54.00");
    assert.equal(result.movie.title, "Filme Teste");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.getSession rejects unexpected response shape", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({ id: "session-1" });

    await assert.rejects(
      adminApi.getSession("session-1"),
      /Unexpected admin session detail response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── adminApi.createSession ───────────────────────────────────────────────────

test("adminApi.createSession posts the session payload", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/sessions/");
      assert.equal(init?.method, "POST");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.movie, "movie-1");
      assert.equal(body.room, "room-1");
      assert.equal(body.audio_format, "legendado");
      assert.equal(body.projection_format, "3d");
      return Response.json(session);
    };

    const created = await adminApi.createSession({
      audio_format: "legendado",
      end_time: "2026-06-10T22:00:00Z",
      movie: "movie-1",
      projection_format: "3d",
      room: "room-1",
      session_type: "preview",
      start_time: "2026-06-10T19:30:00Z",
    });

    assert.equal(created.id, "session-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.createSession rejects unexpected response shape", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({ id: "session-1" });

    await assert.rejects(
      adminApi.createSession({
        end_time: "2026-06-10T22:00:00Z",
        movie: "movie-1",
        room: "room-1",
        start_time: "2026-06-10T19:30:00Z",
      }),
      /Unexpected admin create session response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── adminApi.updateSession ───────────────────────────────────────────────────

test("adminApi.updateSession patches the session by id", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/catalog/sessions/session-1/"
      );
      assert.equal(init?.method, "PATCH");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.audio_format, "dublado");
      return Response.json({ ...session, audio_format: "dublado" });
    };

    const updated = await adminApi.updateSession("session-1", {
      audio_format: "dublado",
    });

    assert.equal(updated.audio_format, "dublado");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── adminApi.deleteSession ───────────────────────────────────────────────────

test("adminApi.deleteSession sends a DELETE request", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/catalog/sessions/session-1/"
      );
      assert.equal(init?.method, "DELETE");
      return new Response(null, { status: 204 });
    };

    await adminApi.deleteSession("session-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── User management fixtures ─────────────────────────────────────────────────

const adminUser = {
  id: "user-1",
  email: "admin@cineprime.local",
  username: "admin",
  is_staff: true,
  is_protected: false,
  role: "master" as const,
  created_at: "2026-01-01T00:00:00Z",
};

const regularUser = {
  id: "user-2",
  email: "user@cineprime.local",
  username: "regular",
  is_staff: false,
  is_protected: false,
  role: "user" as const,
  created_at: "2026-01-02T00:00:00Z",
};

const paginatedUsers = {
  count: 2,
  next: null,
  previous: null,
  results: [adminUser, regularUser],
};

const permissionLog = {
  actor: "admin@cineprime.local",
  target: "user@cineprime.local",
  action: "granted",
  role: "staff" as const,
  created_at: "2026-06-01T10:00:00Z",
};

// ─── adminApi.listUsers ───────────────────────────────────────────────────────

test("adminApi.listUsers fetches the paginated user list", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/users/");
      assert.equal(init?.method, "GET");
      return Response.json(paginatedUsers);
    };

    const response = await adminApi.listUsers();

    assert.equal(response.count, 2);
    assert.equal(response.results[0].email, "admin@cineprime.local");
    assert.equal(response.results[1].email, "user@cineprime.local");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.listUsers builds search param", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  try {
    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return Response.json({ count: 0, next: null, previous: null, results: [] });
    };

    await adminApi.listUsers({ search: "admin" });
    await adminApi.listUsers({ page: 2 });
    await adminApi.listUsers({ search: "user", page: 3 });

    assert.deepEqual(requestedUrls, [
      "http://localhost:8000/api/v1/users/?search=admin",
      "http://localhost:8000/api/v1/users/?page=2",
      "http://localhost:8000/api/v1/users/?search=user&page=3",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.listUsers rejects non-paginated response", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json([]);

    await assert.rejects(
      adminApi.listUsers(),
      /Unexpected admin user list response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── adminApi.grantAdmin ──────────────────────────────────────────────────────

test("adminApi.grantAdmin posts to the admin endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/users/user-2/admin/");
      assert.equal(init?.method, "POST");
      return Response.json({ ...regularUser, is_staff: true });
    };

    const result = await adminApi.grantAdmin("user-2", "staff");

    assert.equal(result.is_staff, true);
    assert.equal(result.id, "user-2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.grantAdmin rejects unexpected response shape", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({ id: "user-2" });

    await assert.rejects(
      adminApi.grantAdmin("user-2", "staff"),
      /Unexpected admin grant response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── adminApi.revokeAdmin ─────────────────────────────────────────────────────

test("adminApi.revokeAdmin sends DELETE to the admin endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/users/user-1/admin/");
      assert.equal(init?.method, "DELETE");
      return Response.json({ ...adminUser, is_staff: false });
    };

    const result = await adminApi.revokeAdmin("user-1");

    assert.equal(result.is_staff, false);
    assert.equal(result.id, "user-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── adminApi.getUserPermissionLogs ──────────────────────────────────────────

test("adminApi.getUserPermissionLogs fetches log entries", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/users/user-2/admin/logs/"
      );
      assert.equal(init?.method, "GET");
      return Response.json([permissionLog]);
    };

    const logs = await adminApi.getUserPermissionLogs("user-2");

    assert.equal(logs.length, 1);
    assert.equal(logs[0].action, "granted");
    assert.equal(logs[0].actor, "admin@cineprime.local");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.getUserPermissionLogs returns empty array when no logs", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json([]);

    const logs = await adminApi.getUserPermissionLogs("user-2");

    assert.equal(logs.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adminApi.getUserPermissionLogs rejects unexpected response shape", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({ results: [] });

    await assert.rejects(
      adminApi.getUserPermissionLogs("user-2"),
      /Unexpected admin permission logs response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
