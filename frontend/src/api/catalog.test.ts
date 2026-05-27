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

const upcomingMovieSummary = {
  duration_minutes: 112,
  genres: [{ id: "genre-2", name: "Drama" }],
  id: "movie-789",
  is_featured: false,
  poster_url: "https://cdn.example.com/movie3.jpg",
  release_date: "2026-12-18",
  status: "em_breve",
  title: "Em Breve",
};

const paginatedMoviesWithReleaseDateResponse = {
  count: 3,
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
    upcomingMovieSummary,
  ],
};

const sessionResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      audio_format: "legendado",
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
        description: "Sala com poltronas premium.",
        display_name: "Sala VIP Prime",
        experience_type: "vip",
        id: "room-1",
        name: "Sala 1",
      },
      projection_format: "3d",
      session_type: "preview",
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
    await catalogApi.listUpcomingMovies();
    await catalogApi.listMovies({
      is_featured: true,
      page: 2,
      status: "em_cartaz",
    });

    assert.deepEqual(requestedUrls, [
      "http://localhost:8000/api/v1/catalog/movies/?is_featured=true",
      "http://localhost:8000/api/v1/catalog/movies/?status=em_cartaz",
      "http://localhost:8000/api/v1/catalog/movies/?status=pre_venda",
      "http://localhost:8000/api/v1/catalog/movies/?status=em_breve",
      "http://localhost:8000/api/v1/catalog/movies/?status=em_cartaz&is_featured=true&page=2",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogApi accepts upcoming movie status in movie responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input) => {
      if (String(input).endsWith("/api/v1/catalog/movies/movie-789/")) {
        return Response.json({
          ...movieDetailResponse,
          id: "movie-789",
          status: "em_breve",
          title: "Em Breve",
        });
      }

      return Response.json({
        count: 1,
        next: null,
        previous: null,
        results: [upcomingMovieSummary],
      });
    };

    const listResponse = await catalogApi.listUpcomingMovies();
    const detailResponse = await catalogApi.getMovie("movie-789");

    assert.equal(listResponse.results[0].status, "em_breve");
    assert.equal(detailResponse.status, "em_breve");
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

test("catalogApi builds optional session metadata filters", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input) => {
      assert.equal(
        input,
        "http://localhost:8000/api/v1/catalog/sessions/?movie=movie-123&experience_type=vip&audio_format=legendado&projection_format=3d&session_type=preview"
      );

      return Response.json(sessionResponse);
    };

    await catalogApi.getSessions({
      audio_format: "legendado",
      experience_type: "vip",
      movie: "movie-123",
      projection_format: "3d",
      session_type: "preview",
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

test("catalogApi rejects movie list results with invalid movie status", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      Response.json({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            ...paginatedMoviesWithReleaseDateResponse.results[0],
            status: "fora_de_catalogo",
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

test("catalogApi rejects session responses with invalid metadata", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      Response.json({
        ...sessionResponse,
        results: [
          {
            ...sessionResponse.results[0],
            audio_format: "karaoke",
          },
        ],
      });

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
