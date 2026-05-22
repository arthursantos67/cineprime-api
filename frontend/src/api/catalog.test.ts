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
