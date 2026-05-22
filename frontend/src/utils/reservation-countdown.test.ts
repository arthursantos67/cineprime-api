import assert from "node:assert/strict";
import test from "node:test";

import {
  formatReservationCountdown,
  getReservationCountdownState,
} from "./reservation-countdown";

test("formatReservationCountdown displays remaining time as mm:ss", () => {
  assert.equal(formatReservationCountdown(0), "00:00");
  assert.equal(formatReservationCountdown(7), "00:07");
  assert.equal(formatReservationCountdown(65), "01:05");
  assert.equal(formatReservationCountdown(600), "10:00");
});

test("getReservationCountdownState calculates remaining time from expires_at", () => {
  const countdown = getReservationCountdownState(
    "2026-05-22T21:40:30.000Z",
    new Date("2026-05-22T21:39:00.000Z")
  );

  assert.deepEqual(countdown, {
    displayValue: "01:30",
    isExpired: false,
    isWarning: false,
    remainingSeconds: 90,
  });
});

test("getReservationCountdownState warns at 60 seconds or less", () => {
  assert.equal(
    getReservationCountdownState(
      new Date("2026-05-22T21:40:00.000Z"),
      new Date("2026-05-22T21:39:00.000Z")
    )?.isWarning,
    true
  );
  assert.equal(
    getReservationCountdownState(
      new Date("2026-05-22T21:40:01.000Z"),
      new Date("2026-05-22T21:39:00.000Z")
    )?.isWarning,
    false
  );
});

test("getReservationCountdownState detects expiration at zero", () => {
  assert.deepEqual(
    getReservationCountdownState(
      new Date("2026-05-22T21:40:00.000Z"),
      new Date("2026-05-22T21:41:00.000Z")
    ),
    {
      displayValue: "00:00",
      isExpired: true,
      isWarning: true,
      remainingSeconds: 0,
    }
  );
});

test("getReservationCountdownState ignores missing or invalid expiration values", () => {
  assert.equal(getReservationCountdownState(null), null);
  assert.equal(getReservationCountdownState("not-a-date"), null);
});
