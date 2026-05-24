import assert from "node:assert/strict";
import test from "node:test";

import { catalogApi } from "./catalog";

const movieDetailResponse = {
  created_at: "2026-05-20T10:00:00-03:00",
  duration_minutes: 125,
  genres: [{ id: "genre-1", name: "Aventura" }],
  id: "movie-123",
  is_featured: false,
  poster_url: "https://cdn.example.com/movie.jpg",
  release_date: "2026-05-13",
  status: "em_cartaz",
  synopsis: "Uma aventura em Natal.",
  title: "A Jornada",
  updated_at: "2026-05-21T10:00:00-03:00",
};

const paginatedMoviesResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

const paginatedMoviesWithReleaseDateResponse = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      duration_minutes: 125,
      genres: [{ id: "genre-1", name: "Aventura" }],
      id: "movie-123",
      is_featured: true,
      poster_url: "https://cdn.example.com/movie.jpg",
      release_date: "2026-05-13",
      status: "em_cartaz",
      title: "A Jornada",
    },
    {
      duration_minutes: 90,
      genres: [],
      id: "movie-456",
      is_featured: false,
      poster_url: "https://cdn.example.com/movie2.jpg",
      release_date: null,
      status: "pre_venda",
      title: "Sem Data",
    },
  ],
};

const sessionResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      base_price: "42.50",
      end_time: "2026-05-22T21:00:00-03:00",
      id: "session-123",
      movie: {
        duration_minutes: 125,
        genres: [{ id: "genre-1", name: "Aventura" }],
        id: "movie-123",
        is_featured: false,
        poster_url: "https://cdn.example.com/movie.jpg",
        release_date: "2026-05-13",
        status: "em_cartaz",
        title: "A Jornada",
      },
      room: {
        capacity: 80,
        id: "room-1",
        name: "Sala 1",
      },
      start_time: "2026-05-22T18:30:00-03:00",
    },
  ],
};

test("catalogApi gets a movie through the public catalog detail endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/movies/movie-123/");
      assert.equal(init?.method, "GET");

      return Response.json(movieDetailResponse);
    };

    const response = await catalogApi.getMovie("movie-123");

    assert.deepEqual(response, movieDetailResponse);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi lists movies through the public catalog endpoint", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://localhost:8000/api/v1/catalog/movies/");
      assert.equal(init?.method, "GET");

      return Response.json(paginatedMoviesResponse);
    };

    const response = await catalogApi.listMovies();

    assert.deepEqual(response, paginatedMoviesResponse);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi gets a session through the public catalog detail endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const sessionDetailResponse = sessionResponse.results[0];

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/catalog/sessions/session-123/"
      );
      assert.equal(init?.method, "GET");

      return Response.json(sessionDetailResponse);
    };

    const response = await catalogApi.getSession("session-123");

    assert.deepEqual(response, sessionDetailResponse);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi builds supported movie filters", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  try {
    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return Response.json(paginatedMoviesResponse);
    };

    await catalogApi.listFeaturedMovies();
    await catalogApi.listNowShowingMovies();
    await catalogApi.listPreSaleMovies();
    await catalogApi.listMovies({
      is_featured: true,
      page: 2,
      status: "em_cartaz",
    });

    assert.deepEqual(requestedUrls, [
      "http://localhost:8000/api/v1/catalog/movies/?is_featured=true",
      "http://localhost:8000/api/v1/catalog/movies/?status=em_cartaz",
      "http://localhost:8000/api/v1/catalog/movies/?status=pre_venda",
      "http://localhost:8000/api/v1/catalog/movies/?status=em_cartaz&is_featured=true&page=2",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi builds session movie and date filters", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/catalog/sessions/?movie=movie-123&date=2026-05-22"
      );
      assert.equal(init?.method, "GET");

      return Response.json(sessionResponse);
    };

    const response = await catalogApi.getSessions({
      date: "2026-05-22",
      movie: "movie-123",
    });

    assert.deepEqual(response, sessionResponse);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi builds optional session range filters", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/catalog/sessions/?movie=movie-123&date=2026-05-22&start_from=2026-05-22T00%3A00%3A00-03%3A00&start_to=2026-05-22T23%3A59%3A59-03%3A00&page=2"
      );

      return Response.json({ ...sessionResponse, results: [] });
    };

    await catalogApi.getSessions({
      date: "2026-05-22",
      movie: "movie-123",
      page: 2,
      start_from: "2026-05-22T00:00:00-03:00",
      start_to: "2026-05-22T23:59:59-03:00",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi rejects unexpected movie detail responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({ id: "movie-123" });

    await assert.rejects(
      catalogApi.getMovie("movie-123"),
      /Unexpected catalog movie detail response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi lists movies with release_date field in results", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      Response.json(paginatedMoviesWithReleaseDateResponse);

    const response = await catalogApi.listMovies();

    assert.deepEqual(response, paginatedMoviesWithReleaseDateResponse);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi rejects movie list results with invalid movie objects", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      Response.json({
        count: 1,
        next: null,
        previous: null,
        results: [{ id: "movie-bad" }],
      });

    await assert.rejects(
      catalogApi.listMovies(),
      /Unexpected catalog movie list response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi rejects movie list results with missing required movie field", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      Response.json({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            duration_minutes: 125,
            genres: [{ id: "genre-1", name: "Aventura" }],
            id: "movie-123",
            is_featured: true,
            poster_url: "https://cdn.example.com/movie.jpg",
            status: "em_cartaz",
          },
        ],
      });

    await assert.rejects(
      catalogApi.listMovies(),
      /Unexpected catalog movie list response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi rejects unexpected non-paginated movie responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json([]);

    await assert.rejects(
      catalogApi.listMovies(),
      /Unexpected catalog movie list response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi rejects unexpected session responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      Response.json({ ...sessionResponse, results: [{ id: "session-123" }] });

    await assert.rejects(
      catalogApi.getSessions({ date: "2026-05-22", movie: "movie-123" }),
      /Unexpected catalog session list response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi rejects unexpected session detail responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({ id: "session-123" });

    await assert.rejects(
      catalogApi.getSession("session-123"),
      /Unexpected catalog session detail response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
