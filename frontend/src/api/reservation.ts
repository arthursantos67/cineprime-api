import type {
  SessionSeatMapItem,
  SessionSeatMapResponse,
  SessionSeatStatus,
  TemporaryReservationReleaseResponse,
  TemporaryReservationReleaseSeat,
  TemporaryReservationResponse,
  TemporaryReservationSeat,
} from "@/types/reservation";

import { apiRequest } from "./client";

export type ReserveSeatsPayload = {
  seat_ids: string[];
};

export type ReleaseReservationsPayload = {
  session_seat_ids: string[];
};

const RESERVATION_SESSIONS_PATH = "/api/v1/reservation/sessions";

export const reservationApi = {
  getSeatMap(sessionId: string) {
    return getSeatMap(sessionId);
  },

  reserveSeats(sessionId: string, seatIds: string[]) {
    return reserveSeats(sessionId, seatIds);
  },

  releaseReservations(sessionId: string, sessionSeatIds: string[]) {
    return releaseReservations(sessionId, sessionSeatIds);
  },
};

async function getSeatMap(sessionId: string) {
  const response = await apiRequest<unknown>(buildSessionSeatMapPath(sessionId), {
    auth: "none",
    method: "GET",
  });

  if (!isSessionSeatMapResponse(response)) {
    throw new Error("Unexpected reservation seat map response.");
  }

  return response satisfies SessionSeatMapResponse;
}

async function reserveSeats(sessionId: string, seatIds: string[]) {
  const response = await apiRequest<unknown>(
    buildSessionReservationsPath(sessionId),
    {
      auth: "required",
      json: { seat_ids: seatIds } satisfies ReserveSeatsPayload,
      method: "POST",
    }
  );

  if (!isTemporaryReservationResponse(response)) {
    throw new Error("Unexpected temporary reservation response.");
  }

  return response satisfies TemporaryReservationResponse;
}

async function releaseReservations(sessionId: string, sessionSeatIds: string[]) {
  const response = await apiRequest<unknown>(
    buildSessionReservationsPath(sessionId),
    {
      auth: "required",
      json: {
        session_seat_ids: sessionSeatIds,
      } satisfies ReleaseReservationsPayload,
      method: "DELETE",
    }
  );

  if (!isTemporaryReservationReleaseResponse(response)) {
    throw new Error("Unexpected temporary reservation release response.");
  }

  return response satisfies TemporaryReservationReleaseResponse;
}

function buildSessionSeatMapPath(sessionId: string) {
  return `${RESERVATION_SESSIONS_PATH}/${sessionId}/seats/`;
}

function buildSessionReservationsPath(sessionId: string) {
  return `${RESERVATION_SESSIONS_PATH}/${sessionId}/reservations/`;
}

function isSessionSeatMapResponse(
  value: unknown
): value is SessionSeatMapResponse {
  return Array.isArray(value) && value.every(isSessionSeatMapItem);
}

function isSessionSeatMapItem(value: unknown): value is SessionSeatMapItem {
  return (
    isRecord(value) &&
    typeof value.session_seat_id === "string" &&
    typeof value.seat_id === "string" &&
    typeof value.row === "string" &&
    typeof value.number === "number" &&
    isSessionSeatStatus(value.status) &&
    typeof value.is_accessible === "boolean" &&
    optionalBoolean(value.reserved_by_current_user) &&
    optionalNullableString(value.lock_expires_at)
  );
}

function isTemporaryReservationResponse(
  value: unknown
): value is TemporaryReservationResponse {
  return (
    isRecord(value) &&
    typeof value.session_id === "string" &&
    typeof value.status === "string" &&
    typeof value.expires_at === "string" &&
    Array.isArray(value.seats) &&
    value.seats.every(isTemporaryReservationSeat)
  );
}

function isTemporaryReservationSeat(
  value: unknown
): value is TemporaryReservationSeat {
  return (
    isRecord(value) &&
    typeof value.seat_id === "string" &&
    typeof value.row === "string" &&
    typeof value.number === "number" &&
    isSessionSeatStatus(value.status)
  );
}

function isTemporaryReservationReleaseResponse(
  value: unknown
): value is TemporaryReservationReleaseResponse {
  return (
    isRecord(value) &&
    typeof value.session_id === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.seats) &&
    value.seats.every(isTemporaryReservationReleaseSeat)
  );
}

function isTemporaryReservationReleaseSeat(
  value: unknown
): value is TemporaryReservationReleaseSeat {
  return (
    isRecord(value) &&
    typeof value.session_seat_id === "string" &&
    typeof value.seat_id === "string" &&
    typeof value.row === "string" &&
    typeof value.number === "number" &&
    isSessionSeatStatus(value.status) &&
    typeof value.is_accessible === "boolean"
  );
}

function isSessionSeatStatus(value: unknown): value is SessionSeatStatus {
  return value === "AVAILABLE" || value === "RESERVED" || value === "PURCHASED";
}

function optionalBoolean(value: unknown) {
  return value === undefined || typeof value === "boolean";
}

function optionalNullableString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
