import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ChatMessage } from "@/types/chatbot";

import { ChatMessageBubble, ChatMessageList } from "./ChatMessageList";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const noop = () => {};

test("renders the user message and the bot reply once it resolves", () => {
  const messages: ChatMessage[] = [
    { id: "1", role: "user", content: "Quais sessões tem hoje?" },
    { id: "2", role: "assistant", content: "Temos 3 sessões hoje." },
  ];

  const html = renderToStaticMarkup(
    createElement(ChatMessageList, {
      isSending: false,
      messages,
      onNavigateToSeatmap: noop,
    })
  );

  assert.match(html, /Quais sessões tem hoje\?/);
  assert.match(html, /Temos 3 sessões hoje\./);
  assert.match(html, /role="log"/);
});

test("shows a typing indicator while waiting for the bot reply", () => {
  const html = renderToStaticMarkup(
    createElement(ChatMessageList, {
      isSending: true,
      messages: [{ id: "1", role: "user", content: "Oi" }],
      onNavigateToSeatmap: noop,
    })
  );

  assert.match(html, /role="status"/);
});

test("shows an empty-state prompt when the conversation has no messages yet", () => {
  const html = renderToStaticMarkup(
    createElement(ChatMessageList, {
      isSending: false,
      messages: [],
      onNavigateToSeatmap: noop,
    })
  );

  assert.match(html, /Pergunte sobre filmes, sessões ou seus ingressos\./);
});

test("multi-turn slot-filling renders every turn of the same conversation in order", () => {
  const messages: ChatMessage[] = [
    { id: "1", role: "user", content: "Quero ver sessões de Duna hoje" },
    { id: "2", role: "assistant", content: "Para qual data?" },
    { id: "3", role: "user", content: "2026-07-12" },
    { id: "4", role: "assistant", content: "Encontrei 3 sessões para essa data." },
  ];

  const html = renderToStaticMarkup(
    createElement(ChatMessageList, {
      isSending: false,
      messages,
      onNavigateToSeatmap: noop,
    })
  );

  const positions = messages.map((message) => html.indexOf(message.content));
  assert.ok(positions.every((position) => position !== -1));
  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions
  );
});

test("renders a seat map CTA carrying the redirect action's session id", () => {
  const message: ChatMessage = {
    id: "1",
    role: "assistant",
    content: "Encontrei assentos disponíveis!",
    action: { action: "redirect", target: "seatmap", session_id: "session-123" },
  };

  const html = renderToStaticMarkup(
    createElement(ChatMessageBubble, { message, onNavigateToSeatmap: noop })
  );

  assert.match(html, /Ir para o mapa de assentos/);
  assert.match(html, /data-session-id="session-123"/);
});

test("does not render a CTA for replies without an actionable redirect", () => {
  const message: ChatMessage = {
    id: "1",
    role: "assistant",
    content: "Não encontrei sessões para essa data.",
  };

  const html = renderToStaticMarkup(
    createElement(ChatMessageBubble, { message, onNavigateToSeatmap: noop })
  );

  assert.doesNotMatch(html, /Ir para o mapa de assentos/);
});

