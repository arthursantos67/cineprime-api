import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CatalogMovieDetail, CatalogSession } from "@/types/catalog";

import { MovieDetailView, SessionList } from "./MovieDetail";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const movie: CatalogMovieDetail = {
  duration_minutes: 125,
  genres: [
    { id: "genre-1", name: "Aventura" },
    { id: "genre-2", name: "Drama" },
  ],
  id: "movie-123",
  is_featured: false,
  poster_url: "https://cdn.example.com/jornada.jpg",
  release_date: "2026-05-13",
  status: "em_cartaz",
  synopsis: "Uma família encontra novas histórias em uma viagem por Natal.",
  title: "A Jornada",
};

test("movie detail renders backend movie fields with accessible media", () => {
  const html = renderToStaticMarkup(
    createElement(MovieDetailView, {
      state: {
        movie,
        status: "success",
      },
    })
  );

  assert.match(html, /A Jornada/);
  assert.match(html, /Poster de A Jornada/);
  assert.match(html, /rel="preload" as="image"/);
  assert.match(html, /data-nimg="1"/);
  assert.match(html, /href="https:\/\/cdn\.example\.com\/jornada\.jpg"/);
  assert.doesNotMatch(html, /\/_next\/image/);
  assert.match(html, /Uma família encontra novas histórias/);
  assert.match(html, /Aventura, Drama/);
  assert.match(html, /2h 5min/);
  assert.match(html, /13\/05\/2026/);
  assert.match(html, /Sessões/);
  assert.match(html, /Carregando sessões/);
  assert.doesNotMatch(html, /role="list" class="session-date-selector"/);
  assert.doesNotMatch(html, /age_rating|classificação/i);
});

test("movie detail session cards render room and session metadata badges", () => {
  const premiumSession: CatalogSession = {
    audio_format: "legendado",
    base_price: "54.00",
    end_time: "2026-05-22T21:00:00-03:00",
    id: "session-premium",
    movie,
    projection_format: "3d",
    room: {
      capacity: 48,
      display_name: "Sala VIP Prime",
      experience_type: "vip",
      id: "room-vip",
      name: "Room VIP",
    },
    session_type: "preview",
    start_time: "2026-05-22T18:30:00-03:00",
  };

  const html = renderToStaticMarkup(
    createElement(SessionList, {
      date: "2026-05-22",
      onRetry: () => undefined,
      state: {
        sessions: [premiumSession],
        status: "success",
      },
    })
  );

  assert.match(html, /Sala VIP Prime/);
  assert.match(html, /VIP/);
  assert.match(html, /3D/);
  assert.match(html, /Legendado/);
  assert.match(html, /Pré-estreia/);
  assert.match(html, /formatos VIP, 3D, Legendado, Pré-estreia/);
});

test("movie detail omits release date when unavailable", () => {
  const html = renderToStaticMarkup(
    createElement(MovieDetailView, {
      state: {
        movie: {
          ...movie,
          release_date: null,
        },
        status: "success",
      },
    })
  );

  assert.doesNotMatch(html, /Estreia/);
  assert.doesNotMatch(html, /Estreia indisponível/);
});

test("movie detail renders stable loading state", () => {
  const html = renderToStaticMarkup(
    createElement(MovieDetailView, {
      state: {
        status: "loading",
      },
    })
  );

  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Carregando detalhes do filme/);
});

test("movie detail renders pt-BR not-found and error states", () => {
  const notFoundHtml = renderToStaticMarkup(
    createElement(MovieDetailView, {
      state: {
        status: "not-found",
      },
    })
  );

  assert.match(notFoundHtml, /Filme não encontrado/);
  assert.match(notFoundHtml, /Não encontramos esse filme no catálogo/);

  const errorHtml = renderToStaticMarkup(
    createElement(MovieDetailView, {
      state: {
        errorMessage: "Não foi possível concluir a solicitação. Tente novamente.",
        status: "error",
      },
    })
  );

  assert.match(errorHtml, /Detalhes indisponíveis/);
  assert.match(errorHtml, /Não foi possível concluir a solicitação/);
  assert.doesNotMatch(errorHtml, /Request failed|Traceback|RESOURCE_NOT_FOUND/i);
});
