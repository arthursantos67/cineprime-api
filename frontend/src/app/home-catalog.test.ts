import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CatalogMovie } from "@/types/catalog";

import { HomeCatalogSections, type MovieSectionState } from "./HomeCatalog";

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

const success = (movies: CatalogMovie[]): MovieSectionState => ({
  movies,
  status: "success",
});

test("home catalog renders featured, now showing, and pre-sale movie sections", () => {
  const html = renderToStaticMarkup(
    createElement(HomeCatalogSections, {
      featured: success([featuredMovie]),
      nowShowing: success([featuredMovie]),
      preSale: success([preSaleMovie]),
    })
  );

  assert.match(html, /Filme em destaque: A Jornada/);
  assert.match(html, /href="\/movies\/featured-1"/);
  assert.match(html, /Em cartaz/);
  assert.match(html, /Pré-venda/);
  assert.match(html, /Estreia da Semana/);
  assert.doesNotMatch(html, /age_rating|room_type|audio_format/i);
});

test("home catalog renders pt-BR loading and empty states", () => {
  const html = renderToStaticMarkup(
    createElement(HomeCatalogSections, {
      featured: { movies: [], status: "loading" },
      nowShowing: success([]),
      preSale: success([]),
    })
  );

  assert.match(html, /Carregando filme em destaque/);
  assert.match(html, /Nenhum filme em cartaz/);
  assert.match(html, /Ainda não há filmes em pré-venda no catálogo./);
});

test("home catalog renders retry-oriented error states", () => {
  const errorState: MovieSectionState = {
    errorMessage: "Não conseguimos carregar esta seção agora.",
    movies: [],
    status: "error",
  };

  const html = renderToStaticMarkup(
    createElement(HomeCatalogSections, {
      featured: errorState,
      nowShowing: errorState,
      onRetryFeatured: () => undefined,
      onRetryNowShowing: () => undefined,
      onRetryPreSale: () => undefined,
      preSale: errorState,
    })
  );

  assert.match(html, /Destaque indisponível/);
  assert.match(html, /Em cartaz indisponível/);
  assert.match(html, /Pré-venda indisponível/);
  assert.match(html, /Tentar novamente/);
});
