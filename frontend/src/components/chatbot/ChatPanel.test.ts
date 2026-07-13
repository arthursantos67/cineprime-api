import assert from "node:assert/strict";
import test from "node:test";

import { createElement, createRef } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChatPanel } from "./ChatPanel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("renders nothing when closed", () => {
  const launcherRef = createRef<HTMLElement>();
  const html = renderToStaticMarkup(
    createElement(
      ChatPanel,
      {
        closeLabel: "Fechar",
        isOpen: false,
        launcherRef,
        onClose: () => {},
        title: "Assistente Cine Prime",
      },
      createElement("p", null, "conteúdo")
    )
  );

  assert.equal(html, "");
});

test("renders the panel docked as a labeled dialog with its content when open", () => {
  const launcherRef = createRef<HTMLElement>();
  const html = renderToStaticMarkup(
    createElement(
      ChatPanel,
      {
        closeLabel: "Fechar assistente",
        isOpen: true,
        launcherRef,
        onClose: () => {},
        title: "Assistente Cine Prime",
      },
      createElement("p", null, "Olá!")
    )
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-labelledby="[^"]+"/);
  assert.match(html, /Assistente Cine Prime/);
  assert.match(html, /Fechar assistente/);
  assert.match(html, /Olá!/);
  // Corner-docked popover, not a centered/backdrop modal.
  assert.match(html, /fixed bottom-24/);
});
