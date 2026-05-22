import assert from "node:assert/strict";
import test from "node:test";

import {
  getPurchaseFlowGuardDecision,
  PURCHASE_FLOW_EXPIRED_MESSAGE,
  PURCHASE_FLOW_MISSING_RESERVATION_MESSAGE,
} from "./purchase-flow-guards";

test("purchase flow guard renders content while a reservation is active", () => {
  assert.deepEqual(
    getPurchaseFlowGuardDecision({
      hasReservedSeats: true,
      isExpired: false,
      sessionId: "session-1",
    }),
    {
      message: null,
      redirectPath: null,
      renderContent: true,
      shouldResetExpiredReservation: false,
      title: null,
    }
  );
});

test("purchase flow guard resets and redirects expired reservations", () => {
  assert.deepEqual(
    getPurchaseFlowGuardDecision({
      hasReservedSeats: true,
      isExpired: true,
      sessionId: "session-1",
    }),
    {
      message: PURCHASE_FLOW_EXPIRED_MESSAGE,
      redirectPath: "/sessions/session-1/seats",
      renderContent: false,
      shouldResetExpiredReservation: true,
      title: "Reserva expirada",
    }
  );
});

test("purchase flow guard blocks ticket and checkout steps without reserved seats", () => {
  assert.deepEqual(
    getPurchaseFlowGuardDecision({
      hasReservedSeats: false,
      isExpired: false,
      sessionId: null,
    }),
    {
      message: PURCHASE_FLOW_MISSING_RESERVATION_MESSAGE,
      redirectPath: null,
      renderContent: false,
      shouldResetExpiredReservation: false,
      title: "Reserva necessária",
    }
  );
});
