import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToString } from "react-dom/server";

import { Badge } from "./Badge";
import { Button, ButtonLink } from "./Button";
import { CarouselControls } from "./CarouselControls";
import { SectionHeading } from "./SectionHeading";
import { Select } from "./Select";
import { Tabs } from "./Tabs";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("button and badge primitives expose shared tokenized variants", () => {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(Button, { variant: "primary" }, "Comprar"),
      createElement(
        ButtonLink,
        { href: "/login", variant: "ghost" },
        "Entrar"
      ),
      createElement(Badge, { tone: "accent" }, "Pre-venda")
    )
  );

  assert.match(html, /bg-brand/);
  assert.match(html, /href="\/login"/);
  assert.match(html, /border-cinema-gold/);
  assert.match(html, /Pre-venda/);
});

test("loading button link exposes disabled link semantics", () => {
  const html = renderToStaticMarkup(
    createElement(
      ButtonLink,
      {
        href: "/checkout",
        isLoading: true,
      },
      "Finalizando"
    )
  );

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /pointer-events-none/);
  assert.match(html, /opacity-\[0\.68\]/);
});

test("section heading, select, tabs, and carousel controls render accessible structure", () => {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(SectionHeading, {
        description: "Escolha sua proxima sessao.",
        eyebrow: "Catalogo",
        title: "CinePrime",
      }),
      createElement(Select, {
        label: "Formato",
        options: [
          { label: "Legendado", value: "legendado" },
          { label: "Dublado", value: "dublado" },
        ],
      }),
      createElement(Tabs, {
        ariaLabel: "Periodos",
        items: [
          { content: "Hoje", label: "Hoje", value: "today" },
          { content: "Amanha", label: "Amanha", value: "tomorrow" },
        ],
      }),
      createElement(CarouselControls, {
        nextLabel: "Proximo filme",
        onNext: () => undefined,
        onPrevious: () => undefined,
        previousLabel: "Filme anterior",
      })
    )
  );

  assert.match(html, /Catalogo/);
  assert.match(html, /<label/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /aria-label="Filme anterior"/);
  assert.match(html, /aria-label="Proximo filme"/);
});

test("tabs fall back when default value is invalid or disabled", () => {
  const invalidDefaultHtml = renderToString(
    createElement(Tabs, {
      ariaLabel: "Periodos",
      defaultValue: "missing",
      items: [
        { content: "Hoje", label: "Hoje", value: "today" },
        { content: "Amanha", label: "Amanha", value: "tomorrow" },
      ],
    })
  );

  assert.match(invalidDefaultHtml, /Hoje/);
  assert.match(invalidDefaultHtml, /aria-selected="true"/);
  assert.match(invalidDefaultHtml, /hidden=""[^>]*>Amanha/);

  const disabledDefaultHtml = renderToString(
    createElement(Tabs, {
      ariaLabel: "Periodos",
      defaultValue: "today",
      items: [
        { content: "Hoje", disabled: true, label: "Hoje", value: "today" },
        { content: "Amanha", label: "Amanha", value: "tomorrow" },
      ],
    })
  );

  assert.match(disabledDefaultHtml, /disabled=""/);
  assert.match(disabledDefaultHtml, /Amanha/);
  assert.match(disabledDefaultHtml, /aria-selected="true"/);
  assert.match(disabledDefaultHtml, /hidden=""[^>]*>Hoje/);
});
