import assert from "node:assert/strict";
import test from "node:test";

import { catalogApi } from "./catalog";

const paginatedMoviesResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

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
