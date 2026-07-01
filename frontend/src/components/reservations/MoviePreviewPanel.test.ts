import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CatalogSession } from "@/types/catalog";

import { MoviePreviewPanel } from "./MoviePreviewPanel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const __dirname = dirname(fileURLToPath(import.meta.url));

const baseSession: CatalogSession = {
  base_price: "30.00",
  end_time: "2026-08-01T22:00:00Z",
  id: "session-1",
  movie: {
    duration_minutes: 120,
    genres: [],
    id: "movie-1",
    is_featured: false,
    poster_url: "https://cdn.example.com/poster.jpg",
    status: "em_cartaz",
    title: "Duna: Parte Dois",
  },
  room: {
    capacity: 80,
    id: "room-1",
    name: "Sala 1",
  },
  start_time: "2026-08-01T20:00:00Z",
};

test("preview panel hides the trailer toggle when trailer_url is absent, even if spotlight_url is set", () => {
  const session: CatalogSession = {
    ...baseSession,
    movie: {
      ...baseSession.movie,
      spotlight_url: "https://cdn.example.com/spotlight-banner.jpg",
    },
  };

  const html = renderToStaticMarkup(createElement(MoviePreviewPanel, { session }));

  assert.doesNotMatch(html, />Trailer</);
});

test("preview panel shows the trailer toggle when trailer_url is set", () => {
  const session: CatalogSession = {
    ...baseSession,
    movie: {
      ...baseSession.movie,
      trailer_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    },
  };

  const html = renderToStaticMarkup(createElement(MoviePreviewPanel, { session }));

  assert.match(html, />Trailer</);
});

test("preview panel source embeds movie.trailer_url in the iframe and never reads spotlight_url", () => {
  const source = readFileSync(resolve(__dirname, "MoviePreviewPanel.tsx"), "utf8");

  assert.match(source, /movie\.trailer_url/);
  assert.doesNotMatch(source, /movie\.spotlight_url/);
});
