import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChatInput } from "./ChatInput";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("renders a labeled message field and send button", () => {
  const html = renderToStaticMarkup(
    createElement(ChatInput, { isSending: false, onSend: () => {} })
  );

  assert.match(html, /<form/);
  assert.match(html, /Mensagem/);
  assert.match(html, /Digite sua mensagem/);
  assert.match(html, /Enviar/);
});

test("disables the input and shows a busy send button while a message is in flight", () => {
  const html = renderToStaticMarkup(
    createElement(ChatInput, { isSending: true, onSend: () => {} })
  );

  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
});
