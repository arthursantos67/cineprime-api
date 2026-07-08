import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  getFormatBadges,
  TicketCodeDialogContent,
} from "./TicketCard";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("ticket code dialog renders a real QR code and the raw code for manual entry", () => {
  const html = renderToStaticMarkup(
    createElement(TicketCodeDialogContent, { code: "CN-QR-001" })
  );

  // react-qr-code emits an inline SVG (scannable), not a decorative bar strip.
  assert.match(html, /<svg/);
  assert.match(html, /role="img"/);
  assert.match(html, /QR code do ingresso CN-QR-001/);
  assert.match(html, /CN-QR-001/);
});

test("getFormatBadges surfaces projection and audio formats when present", () => {
  const identity = (key: string) => key;

  assert.deepEqual(
    getFormatBadges(
      { start_time: "", projection_format: "3d", audio_format: "legendado" },
      identity
    ),
    [
      { label: "domain.projection.3d", tone: "accent" },
      { label: "domain.audio.legendado", tone: "info" },
    ]
  );
});

test("getFormatBadges tones 2D as neutral and omits missing formats", () => {
  const identity = (key: string) => key;

  assert.deepEqual(
    getFormatBadges({ start_time: "", projection_format: "2d" }, identity),
    [{ label: "domain.projection.2d", tone: "neutral" }]
  );
  assert.deepEqual(getFormatBadges({ start_time: "" }, identity), []);
});
