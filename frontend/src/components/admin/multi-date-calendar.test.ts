import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildCalendarWeeks,
  MultiDateCalendar,
  toggleDateInList,
} from "./MultiDateCalendar";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("buildCalendarWeeks pads July 2026 to Sunday-based weeks", () => {
  // 2026-07-01 is a Wednesday and the month has 31 days.
  const weeks = buildCalendarWeeks(2026, 6);
  const cells = weeks.flat();

  assert.equal(weeks.length, 5);
  assert.ok(weeks.every((week) => week.length === 7));
  assert.deepEqual(cells.slice(0, 3), [null, null, null]);
  assert.equal(cells[3]?.iso, "2026-07-01");
  assert.equal(cells[33]?.iso, "2026-07-31");
  assert.equal(cells[34], null);
  assert.equal(cells.filter(Boolean).length, 31);
});

test("toggleDateInList adds new dates sorted and removes existing ones", () => {
  const withAdded = toggleDateInList(["2026-07-20", "2026-07-10"], "2026-07-15");

  assert.deepEqual(withAdded, ["2026-07-10", "2026-07-15", "2026-07-20"]);
  assert.deepEqual(toggleDateInList(withAdded, "2026-07-15"), [
    "2026-07-10",
    "2026-07-20",
  ]);
});

test("calendar marks selected dates and disables past and excluded days", () => {
  const html = renderToStaticMarkup(
    createElement(MultiDateCalendar, {
      disabledDates: ["2026-07-12"],
      initialMonth: "2026-07-01",
      minDate: "2026-07-10",
      onToggleDate: () => {},
      selectedDates: ["2026-07-15"],
    })
  );

  const pressedCount = (html.match(/aria-pressed="true"/g) ?? []).length;
  const dayButtons = (html.match(/aria-pressed=/g) ?? []).length;
  const disabledButtons = (html.match(/disabled=""/g) ?? []).length;

  assert.equal(dayButtons, 31);
  assert.equal(pressedCount, 1);
  // Days 1-9 fall before minDate and day 12 is excluded (session start date).
  assert.equal(disabledButtons, 10);
  assert.match(html, /julho de 2026/i);
});
