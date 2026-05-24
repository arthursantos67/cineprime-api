import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { UserTicket } from "@/types/ticket";

import {
  getTicketFilterFromSearchParams,
  MyTicketsContent,
  TicketCard,
} from "./my-tickets";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const ticket: UserTicket = {
  amount_paid: "21.25",
  created_at: "2026-05-22T20:20:00-03:00",
  movie: {
    id: "movie-1",
    poster_url: "https://cdn.example.com/movie.jpg",
    title: "A Jornada",
  },
  payment_method: "pix",
  room: {
    id: "room-1",
    name: "Sala 1",
  },
  seat: {
    id: "seat-1",
    identifier: "A1",
    number: 1,
    row: "A",
  },
  session: {
    end_time: "2026-05-22T20:30:00-03:00",
    id: "session-1",
    start_time: "2026-05-22T18:30:00-03:00",
  },
  ticket_code: "ABC123",
  ticket_id: "ticket-1",
  ticket_type: "meia",
};

test("getTicketFilterFromSearchParams accepts only shareable ticket filters", () => {
  assert.equal(
    getTicketFilterFromSearchParams(new URLSearchParams("type=upcoming")),
    "upcoming"
  );
  assert.equal(
    getTicketFilterFromSearchParams(new URLSearchParams("type=past")),
    "past"
  );
  assert.equal(
    getTicketFilterFromSearchParams(new URLSearchParams("type=archived")),
    null
  );
});

test("my tickets content renders active pt-BR filter links", () => {
  const html = renderToStaticMarkup(
    createElement(MyTicketsContent, {
      activeFilter: "upcoming",
      status: "success",
      tickets: [ticket],
    })
  );

  assert.match(html, /href="\/my-tickets"/);
  assert.match(html, /href="\/my-tickets\?type=upcoming"/);
  assert.match(html, /href="\/my-tickets\?type=past"/);
  assert.match(html, /aria-current="page"[^>]*>Próximos/);
  assert.match(html, /role="list"/);
  assert.match(html, /role="listitem"/);
});

test("my tickets content renders loading, empty, and error states", () => {
  const loadingHtml = renderToStaticMarkup(
    createElement(MyTicketsContent, {
      activeFilter: null,
      status: "loading",
      tickets: [],
    })
  );
  const emptyHtml = renderToStaticMarkup(
    createElement(MyTicketsContent, {
      activeFilter: "past",
      status: "success",
      tickets: [],
    })
  );
  const errorHtml = renderToStaticMarkup(
    createElement(MyTicketsContent, {
      activeFilter: null,
      errorMessage: "Sua sessão expirou. Faça login novamente.",
      status: "error",
      tickets: [],
    })
  );

  assert.match(loadingHtml, /Carregando ingressos/);
  assert.match(emptyHtml, /Nenhum ingresso anterior/);
  assert.match(emptyHtml, /Nenhum ingresso anterior foi encontrado/);
  assert.match(errorHtml, /Ingressos indisponíveis/);
  assert.match(errorHtml, /Sua sessão expirou/);
});

test("my tickets error state renders retry button", () => {
  const html = renderToStaticMarkup(
    createElement(MyTicketsContent, {
      activeFilter: null,
      errorMessage: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
      onRetry: () => undefined,
      status: "error",
      tickets: [],
    })
  );

  assert.match(html, /Ingressos indisponíveis/);
  assert.match(html, /Tentar novamente/);
  assert.match(html, /servidor/);
});

test("ticket card renders ticket details with Brazilian formatting", () => {
  const html = renderToStaticMarkup(createElement(TicketCard, { ticket }));

  assert.match(html, /A Jornada/);
  assert.match(html, /22\/05\/2026, 18:30/);
  assert.match(html, /Sala 1/);
  assert.match(html, /A1/);
  assert.match(html, /Meia-entrada/);
  assert.match(html, /R\$\s?21,25/);
  assert.match(html, /PIX/);
  assert.match(html, /ABC123/);
});
