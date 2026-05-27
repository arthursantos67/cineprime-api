import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CatalogMovie } from "@/types/catalog";

import {
  getMovieDiscoveryFiltersFromSearchParams,
  HomeCatalogSections,
  type GenreFilterState,
  type MovieDiscoveryFilters,
  type MovieDiscoveryState,
  type MovieSectionState,
} from "./HomeCatalog";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const featuredMovie: CatalogMovie = {
  duration_minutes: 120,
  genres: [{ id: "genre-1", name: "Aventura" }],
  id: "featured-1",
  is_featured: true,
  poster_url: "https://cdn.example.com/featured.jpg",
  status: "em_cartaz",
  title: "A Jornada",
};

const preSaleMovie: CatalogMovie = {
  ...featuredMovie,
  id: "pre-sale-1",
  is_featured: false,
  status: "pre_venda",
  title: "Estreia da Semana",
};

const emptyFilters: MovieDiscoveryFilters = {
  genre: null,
  status: null,
  title: "",
};

const genres: GenreFilterState = {
  genres: [
    { id: "genre-1", name: "Aventura" },
    { id: "genre-2", name: "Drama" },
  ],
  status: "success",
};

const success = (movies: CatalogMovie[]): MovieSectionState => ({
  movies,
  status: "success",
});

const discoverySuccess = (
  movies: CatalogMovie[],
  availabilityByMovieId: MovieDiscoveryState["availabilityByMovieId"] = {}
): MovieDiscoveryState => ({
  availabilityByMovieId,
  movies,
  status: "success",
});

function renderHomeCatalog(
  overrides: Partial<React.ComponentProps<typeof HomeCatalogSections>> = {}
) {
  return renderToStaticMarkup(
    createElement(HomeCatalogSections, {
      discovery: discoverySuccess([featuredMovie, preSaleMovie], {
        "featured-1": "available",
        "pre-sale-1": "unavailable",
      }),
      featured: success([featuredMovie]),
      filters: emptyFilters,
      genres,
      searchValue: "",
      ...overrides,
    })
  );
}

test("home catalog renders featured movie, search controls, filters, and results", () => {
  const html = renderHomeCatalog();

  assert.match(html, /Filme em destaque: A Jornada/);
  assert.match(html, /href="\/movies\/featured-1"/);
  assert.match(html, /Encontrar filmes/);
  assert.match(html, /Ex.: A Jornada/);
  assert.match(html, /Todos/);
  assert.match(html, /Em cartaz/);
  assert.match(html, /Pré-venda/);
  assert.match(html, /Em breve/);
  assert.match(html, /Todos os gêneros/);
  assert.match(html, /Drama/);
  assert.match(html, /Estreia da Semana/);
  assert.match(html, /Há sessões hoje ou nos próximos dias/);
  assert.match(html, /Sem sessões hoje ou nos próximos dias/);
  assert.doesNotMatch(html, /age_rating|room_type|audio_format/i);
});

test("home catalog renders pt-BR loading and empty states with clear filters action", () => {
  const loadingHtml = renderHomeCatalog({
    discovery: {
      availabilityByMovieId: {},
      movies: [],
      status: "loading",
    },
    featured: { movies: [], status: "loading" },
  });

  assert.match(loadingHtml, /Carregando filme em destaque/);
  assert.match(loadingHtml, /Buscando filmes/);

  const emptyHtml = renderHomeCatalog({
    discovery: discoverySuccess([]),
    filters: {
      genre: "genre-2",
      status: "pre_venda",
      title: "inexistente",
    },
    onClearFilters: () => undefined,
    searchValue: "inexistente",
  });

  assert.match(emptyHtml, /Nenhum filme encontrado/);
  assert.match(emptyHtml, /Limpar filtros/);
});

test("home catalog renders retry-oriented error states", () => {
  const errorState: MovieSectionState = {
    errorMessage: "Não conseguimos carregar esta seção agora.",
    movies: [],
    status: "error",
  };

  const html = renderHomeCatalog({
    discovery: {
      availabilityByMovieId: {},
      errorMessage: "Não foi possível buscar filmes agora.",
      movies: [],
      status: "error",
    },
    featured: errorState,
    onRetryDiscovery: () => undefined,
    onRetryFeatured: () => undefined,
  });

  assert.match(html, /Destaque indisponível/);
  assert.match(html, /Busca indisponível/);
  assert.match(html, /Tentar novamente/);
});

test("home catalog URL parser keeps only supported status values", () => {
  const validParams = new URLSearchParams(
    "q=jornada&status=em_breve&genre=genre-1"
  );
  const invalidParams = new URLSearchParams("q=x&status=fora&genre=");

  assert.deepEqual(getMovieDiscoveryFiltersFromSearchParams(validParams), {
    genre: "genre-1",
    status: "em_breve",
    title: "jornada",
  });
  assert.deepEqual(getMovieDiscoveryFiltersFromSearchParams(invalidParams), {
    genre: null,
    status: null,
    title: "x",
  });
});
