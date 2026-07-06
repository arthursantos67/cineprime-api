import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToString } from "react-dom/server";

import { Badge } from "./Badge";
import { Button, ButtonLink } from "./Button";
import { CarouselControls } from "./CarouselControls";
import { Input } from "./Input";
import { PasswordInput } from "./PasswordInput";
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

test("selected tab never carries both text-muted and its own text color class", () => {
  // Regression: cn() does not dedupe conflicting Tailwind classes, so if the
  // selected tab's button keeps the base "text-muted" class alongside its own
  // color class, the two same-specificity rules fight over which one wins in
  // the compiled stylesheet instead of the selected color reliably applying.
  const html = renderToStaticMarkup(
    createElement(Tabs, {
      ariaLabel: "Periodos",
      items: [
        { content: "Hoje", label: "Hoje", value: "today" },
        { content: "Amanha", label: "Amanha", value: "tomorrow" },
      ],
    })
  );

  const selectedButtonMatch = /<button[^>]*aria-selected="true"[^>]*>/.exec(html);
  assert.ok(selectedButtonMatch);
  assert.doesNotMatch(selectedButtonMatch[0], /\btext-muted\b/);
});

test("input renders a themed, accessible text field with label and error", () => {
  const html = renderToStaticMarkup(
    createElement(Input, {
      error: "Informe um e-mail válido.",
      id: "email",
      label: "E-mail",
      name: "email",
      type: "email",
    })
  );

  assert.match(html, /<label[^>]*for="email"/);
  assert.match(html, /bg-white\/\[0\.04\]/);
  assert.match(html, /border-white\/\[0\.10\]/);
  assert.match(html, /aria-invalid="true"[^>]*id="email"/);
  assert.match(html, /aria-describedby="email-error"/);
  assert.match(html, /id="email-error"[^>]*role="alert"/);
  assert.match(html, /Informe um e-mail válido\./);
});

test("password input toggles type via an accessible eye button", () => {
  const html = renderToStaticMarkup(
    createElement(PasswordInput, {
      id: "password",
      label: "Senha",
      name: "password",
    })
  );

  assert.match(html, /<input[^>]*id="password"/);
  assert.match(html, /type="password"/);
  assert.match(html, /<button[^>]*aria-label="Mostrar senha"/);
  assert.match(html, /aria-pressed="false"/);
  assert.doesNotMatch(html, /type="text"/);
});
