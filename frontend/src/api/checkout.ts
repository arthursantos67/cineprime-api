import type {
  CheckoutPayload,
  CheckoutResponse,
  CheckoutSeatResponse,
  CheckoutTicketResponse,
  PaymentMethod,
  SessionSeatStatus,
  TicketType,
} from "@/types/reservation";

import { apiRequest } from "./client";

const CHECKOUT_PATH = "/api/v1/reservation/checkout/";

export const checkoutApi = {
  checkout(payload: CheckoutPayload) {
    return checkout(payload);
  },
};

async function checkout(payload: CheckoutPayload) {
  const response = await apiRequest<unknown>(CHECKOUT_PATH, {
    auth: "required",
    json: payload,
    method: "POST",
  });

  if (!isCheckoutResponse(response)) {
    throw new Error("Unexpected checkout response.");
  }

  return response satisfies CheckoutResponse;
}

function isCheckoutResponse(value: unknown): value is CheckoutResponse {
  return (
    isRecord(value) &&
    typeof value.status === "string" &&
    isPaymentMethod(value.payment_method) &&
    typeof value.total_amount === "string" &&
    Array.isArray(value.seats) &&
    value.seats.every(isCheckoutSeatResponse) &&
    Array.isArray(value.tickets) &&
    value.tickets.every(isCheckoutTicketResponse)
  );
}

function isCheckoutSeatResponse(value: unknown): value is CheckoutSeatResponse {
  return (
    isRecord(value) &&
    typeof value.session_seat_id === "string" &&
    typeof value.seat_id === "string" &&
    typeof value.row === "string" &&
    typeof value.number === "number" &&
    isSessionSeatStatus(value.status) &&
    isTicketType(value.ticket_type) &&
    typeof value.amount_paid === "string"
  );
}

function isCheckoutTicketResponse(
  value: unknown
): value is CheckoutTicketResponse {
  return (
    isRecord(value) &&
    typeof value.ticket_id === "string" &&
    typeof value.ticket_code === "string" &&
    typeof value.session_seat_id === "string" &&
    typeof value.seat_id === "string" &&
    isTicketType(value.ticket_type) &&
    typeof value.amount_paid === "string" &&
    isPaymentMethod(value.payment_method) &&
    isRecord(value.movie) &&
    typeof value.movie.id === "string" &&
    typeof value.movie.title === "string" &&
    isRecord(value.session) &&
    typeof value.session.id === "string" &&
    typeof value.session.start_time === "string" &&
    typeof value.session.end_time === "string" &&
    isRecord(value.room) &&
    typeof value.room.id === "string" &&
    typeof value.room.name === "string" &&
    isRecord(value.seat) &&
    typeof value.seat.id === "string" &&
    typeof value.seat.row === "string" &&
    typeof value.seat.number === "number" &&
    typeof value.seat.identifier === "string"
  );
}

function isTicketType(value: unknown): value is TicketType {
  return value === "inteira" || value === "meia";
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "cartao_credito" || value === "pix";
}

function isSessionSeatStatus(value: unknown): value is SessionSeatStatus {
  return value === "AVAILABLE" || value === "RESERVED" || value === "PURCHASED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
