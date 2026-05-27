import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CatalogMovie } from "@/types/catalog";

import { FeaturedMovieBanner } from "./FeaturedMovieBanner";
import { MovieCard } from "./MovieCard";
import { MovieCarousel } from "./MovieCarousel";
import { MovieGrid } from "./MovieGrid";
import {
  formatMovieDuration,
  formatMovieGenres,
  formatMovieReleaseDate,
  getMovieDetailsHref,
} from "./movie-formatters";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const movie: CatalogMovie = {
  duration_minutes: 166,
  genres: [
    { id: "genre-1", name: "Ficção científica" },
    { id: "genre-2", name: "Aventura" },
  ],
  id: "movie-123",
  is_featured: true,
  poster_url: "https://cdn.example.com/duna.jpg",
  status: "em_cartaz",
  title: "Duna: Parte Dois",
};

test("movie card renders backend movie fields and navigates to the detail route", () => {
  const html = renderToStaticMarkup(createElement(MovieCard, { movie }));

  assert.match(html, /href="\/movies\/movie-123"/);
  assert.match(html, /Ver detalhes de Duna: Parte Dois/);
  assert.match(html, /Poster de Duna: Parte Dois/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /data-nimg="1"/);
  assert.match(html, /src="https:\/\/cdn\.example\.com\/duna\.jpg"/);
  assert.doesNotMatch(html, /\/_next\/image/);
  assert.match(html, /Duna: Parte Dois/);
  assert.match(html, /Ficção científica, Aventura/);
  assert.match(html, /2h 46min/);
  assert.doesNotMatch(html, /age_rating|room_type|audio_format/i);
});

test("movie grid renders an accessible list of movie cards", () => {
  const html = renderToStaticMarkup(
    createElement(MovieGrid, {
      movies: [movie],
      title: "Em cartaz",
    })
  );

  assert.match(html, /<section/);
  assert.match(html, /role="list"/);
  assert.match(html, /Em cartaz/);
  assert.match(html, /Duna: Parte Dois/);
});

test("movie grid renders pt-BR empty and loading states", () => {
  const emptyHtml = renderToStaticMarkup(
    createElement(MovieGrid, {
      movies: [],
      title: "Pré-venda",
    })
  );

  assert.match(emptyHtml, /Nenhum filme disponível/);
  assert.match(emptyHtml, /Nenhum filme foi encontrado para esta seção./);

  const loadingHtml = renderToStaticMarkup(
    createElement(MovieGrid, {
      isLoading: true,
      movies: [],
      skeletonCount: 2,
    })
  );

  assert.match(loadingHtml, /role="status"/);
  assert.match(loadingHtml, /Carregando filmes.../);
  assert.match(loadingHtml, /aria-busy="true"/);
});

test("movie carousel renders an accessible horizontal rail with controls", () => {
  const html = renderToStaticMarkup(
    createElement(MovieCarousel, {
      movies: [
        movie,
        {
          ...movie,
          id: "movie-456",
          title: "Interestelar",
        },
      ],
      title: "Em breve",
    })
  );

  assert.match(html, /movie-carousel-section/);
  assert.match(html, /Em breve: carrossel de filmes/);
  assert.match(html, /role="list"/);
  assert.match(html, /Filme anterior em Em breve/);
  assert.match(html, /Próximo filme em Em breve/);
  assert.match(html, /Duna: Parte Dois/);
  assert.match(html, /Interestelar/);
});

test("movie carousel preserves empty and loading states", () => {
  const emptyHtml = renderToStaticMarkup(
    createElement(MovieCarousel, {
      emptyDescription: "Sem próximos lançamentos.",
      emptyTitle: "Nada por aqui",
      movies: [],
      title: "Em breve",
    })
  );

  assert.match(emptyHtml, /Nada por aqui/);
  assert.match(emptyHtml, /Sem próximos lançamentos./);

  const loadingHtml = renderToStaticMarkup(
    createElement(MovieCarousel, {
      isLoading: true,
      loadingLabel: "Carregando próximos lançamentos...",
      movies: [],
      skeletonCount: 2,
      title: "Em breve",
    })
  );

  assert.match(loadingHtml, /role="status"/);
  assert.match(loadingHtml, /Carregando próximos lançamentos.../);
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /movie-card--skeleton/);
});

test("featured banner renders featured movie media and primary action", () => {
  const html = renderToStaticMarkup(
    createElement(FeaturedMovieBanner, { movie })
  );

  assert.match(html, /Filme em destaque: Duna: Parte Dois/);
  assert.match(html, /Poster de Duna: Parte Dois/);
  assert.match(html, /rel="preload" as="image"/);
  assert.match(html, /data-nimg="1"/);
  assert.match(html, /href="https:\/\/cdn\.example\.com\/duna\.jpg"/);
  assert.doesNotMatch(html, /\/_next\/image/);
  assert.match(html, /Destaque/);
  assert.match(html, /Ver sessões/);
  assert.match(html, /href="\/movies\/movie-123"/);
  assert.match(html, /Ficção científica, Aventura \| 2h 46min/);
});

test("featured banner renders multiple featured movies as a navigable carousel", () => {
  const html = renderToStaticMarkup(
    createElement(FeaturedMovieBanner, {
      movies: [
        movie,
        {
          ...movie,
          id: "movie-456",
          title: "Interestelar",
        },
      ],
      primaryActionLabel: "Ver detalhes",
    })
  );

  assert.match(html, /featured-movie-carousel/);
  assert.match(html, /Filme em destaque: Duna: Parte Dois/);
  assert.match(html, /Filme em destaque: Interestelar/);
  assert.match(html, /Mostrar destaque anterior/);
  assert.match(html, /Mostrar próximo destaque/);
  assert.match(html, /href="\/movies\/movie-456"/);
});

test("movie component helpers format API-shaped values", () => {
  assert.equal(formatMovieDuration(45), "45min");
  assert.equal(formatMovieDuration(120), "2h");
  assert.equal(formatMovieDuration(125), "2h 5min");
  assert.equal(formatMovieDuration(0), "Duração indisponível");
  assert.equal(formatMovieGenres([]), "Gênero indisponível");
  assert.equal(formatMovieGenres(movie.genres), "Ficção científica, Aventura");
  assert.equal(formatMovieReleaseDate("2026-05-13"), "13/05/2026");
  assert.equal(formatMovieReleaseDate(null), "Estreia indisponível");
  assert.equal(getMovieDetailsHref(movie.id), "/movies/movie-123");
});
