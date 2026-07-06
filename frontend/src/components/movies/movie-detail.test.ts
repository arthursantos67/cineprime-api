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

test("movie detail shows trailer toggle when trailer_url is available", () => {
  const html = renderToStaticMarkup(
    createElement(MovieDetailView, {
      state: {
        movie: { ...movie, trailer_url: "https://www.youtube.com/embed/abc123" },
        status: "success",
      },
    })
  );

  assert.match(html, /aria-labelledby="movie-trailer"/);
  assert.match(html, /Trailer/);
  assert.match(html, /aria-expanded="false"/);
  // Collapsed by default: the iframe is only mounted after the toggle opens.
  assert.doesNotMatch(html, /youtube\.com\/embed\/abc123/);
});

test("movie detail omits trailer section without trailer_url", () => {
  const html = renderToStaticMarkup(
    createElement(MovieDetailView, {
      state: {
        movie,
        status: "success",
      },
    })
  );

  assert.doesNotMatch(html, /aria-labelledby="movie-trailer"/);
});

test("movie detail session cards render room and session metadata badges", () => {
  const premiumSession: CatalogSession = {
    audio_format: "legendado",
    base_price: "54.00",
    end_time: "2099-12-31T21:00:00-03:00",
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
    start_time: "2099-12-31T18:30:00-03:00",
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

test("past session renders disabled span instead of link", () => {
  const pastSession: CatalogSession = {
    audio_format: "legendado",
    base_price: "54.00",
    end_time: "2026-05-22T21:00:00-03:00",
    id: "session-past",
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
        sessions: [pastSession],
        status: "success",
      },
    })
  );

  assert.match(html, /Sala VIP Prime/);
  assert.match(html, /18:30/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /Sessão das 18:30 encerrada/);
  assert.doesNotMatch(html, new RegExp(`href="/sessions/session-past/seats"`));
  assert.doesNotMatch(html, /formatos VIP, 3D, Legendado, Pré-estreia/);
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

test("em_breve movie detail shows coming-soon notice and hides session selector", () => {
  const comingSoonMovie: CatalogMovieDetail = {
    ...movie,
    id: "movie-upcoming",
    release_date: "2026-08-01",
    status: "em_breve",
    title: "Ainda Por Vir",
  };

  const html = renderToStaticMarkup(
    createElement(MovieDetailView, {
      state: { movie: comingSoonMovie, status: "success" },
    })
  );

  assert.match(html, /Ainda Por Vir/);
  assert.match(html, /Em breve nas telas/);
  assert.doesNotMatch(html, /Sessões/);
  assert.doesNotMatch(html, /Carregando sessões/);
  assert.doesNotMatch(html, /Selecionar sessão/);
});

test("em_breve movie detail shows interest count when data is available", () => {
  const comingSoonMovie: CatalogMovieDetail = {
    ...movie,
    id: "movie-upcoming",
    release_date: "2026-08-01",
    status: "em_breve",
    title: "Ainda Por Vir",
  };

  const html = renderToStaticMarkup(
    createElement(MovieDetailView, {
      interestState: {
        data: { count: 42, user_interested: false },
        status: "success",
      },
      isAuthenticated: false,
      state: { movie: comingSoonMovie, status: "success" },
    })
  );

  assert.match(html, /42 pessoas interessadas/);
  assert.match(html, /Entre para demonstrar interesse/);
  assert.doesNotMatch(html, /Tenho interesse/);
});

test("em_breve movie detail shows interest toggle for authenticated user", () => {
  const comingSoonMovie: CatalogMovieDetail = {
    ...movie,
    id: "movie-upcoming",
    release_date: "2026-08-01",
    status: "em_breve",
    title: "Ainda Por Vir",
  };

  const htmlNotInterested = renderToStaticMarkup(
    createElement(MovieDetailView, {
      interestState: {
        data: { count: 5, user_interested: false },
        status: "success",
      },
      isAuthenticated: true,
      state: { movie: comingSoonMovie, status: "success" },
    })
  );

  assert.match(htmlNotInterested, /Tenho interesse/);
  assert.doesNotMatch(htmlNotInterested, /Remover interesse/);

  const htmlInterested = renderToStaticMarkup(
    createElement(MovieDetailView, {
      interestState: {
        data: { count: 6, user_interested: true },
        status: "success",
      },
      isAuthenticated: true,
      state: { movie: comingSoonMovie, status: "success" },
    })
  );

  assert.match(htmlInterested, /Remover interesse/);
  assert.doesNotMatch(htmlInterested, /Tenho interesse/);
});

test("em_breve movie detail shows error message when interest update fails", () => {
  const comingSoonMovie: CatalogMovieDetail = {
    ...movie,
    id: "movie-upcoming",
    release_date: "2026-08-01",
    status: "em_breve",
    title: "Ainda Por Vir",
  };

  const html = renderToStaticMarkup(
    createElement(MovieDetailView, {
      interestState: {
        data: { count: 3, user_interested: false },
        status: "error",
      },
      isAuthenticated: true,
      state: { movie: comingSoonMovie, status: "success" },
    })
  );

  assert.match(html, /Não foi possível atualizar seu interesse/);
});

test("em_breve movie detail hides count text when count is zero", () => {
  const comingSoonMovie: CatalogMovieDetail = {
    ...movie,
    id: "movie-upcoming",
    release_date: "2026-08-01",
    status: "em_breve",
    title: "Ainda Por Vir",
  };

  const html = renderToStaticMarkup(
    createElement(MovieDetailView, {
      interestState: {
        data: { count: 0, user_interested: null },
        status: "success",
      },
      isAuthenticated: false,
      state: { movie: comingSoonMovie, status: "success" },
    })
  );

  assert.doesNotMatch(html, /0 pessoas interessadas/);
  assert.match(html, /Entre para demonstrar interesse/);
});

test("em_cartaz movie detail still shows session selector", () => {
  const html = renderToStaticMarkup(
    createElement(MovieDetailView, {
      state: { movie, status: "success" },
    })
  );

  assert.match(html, /Sessões/);
  assert.match(html, /Carregando sessões/);
  assert.doesNotMatch(html, /Em breve nas telas/);
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
