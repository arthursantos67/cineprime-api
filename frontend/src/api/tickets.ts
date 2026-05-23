import type { TicketFilterType, UserTicket } from "@/types/ticket";

import {
  apiRequest,
  isPaginatedResponse,
  type PaginatedResponse,
} from "./client";

export type ListMyTicketsParams = {
  type?: TicketFilterType;
};

const MY_TICKETS_PATH = "/api/v1/users/me/tickets/";

export const ticketsApi = {
  listMyTickets(params: ListMyTicketsParams = {}, options: RequestInit = {}) {
    return listMyTickets(params, options);
  },
};

async function listMyTickets(
  params: ListMyTicketsParams,
  options: RequestInit
) {
  const response = await apiRequest<unknown>(buildMyTicketsPath(params), {
    ...options,
    auth: "required",
    method: "GET",
  });

  if (
    !isPaginatedResponse<UserTicket>(response) ||
    !response.results.every(isUserTicket)
  ) {
    throw new Error("Unexpected my tickets response.");
  }

  return response satisfies PaginatedResponse<UserTicket>;
}

function buildMyTicketsPath({ type }: ListMyTicketsParams) {
  const searchParams = new URLSearchParams();

  if (type) {
    searchParams.set("type", type);
  }

  const query = searchParams.toString();
  return query ? `${MY_TICKETS_PATH}?${query}` : MY_TICKETS_PATH;
}

function isUserTicket(value: unknown): value is UserTicket {
  return (
    isRecord(value) &&
    typeof value.ticket_id === "string" &&
    typeof value.ticket_code === "string" &&
    isTicketType(value.ticket_type) &&
    typeof value.amount_paid === "string" &&
    isPaymentMethod(value.payment_method) &&
    typeof value.created_at === "string" &&
    isTicketMovie(value.movie) &&
    isTicketSession(value.session) &&
    isTicketRoom(value.room) &&
    isTicketSeat(value.seat)
  );
}

function isTicketMovie(value: unknown): value is UserTicket["movie"] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (typeof value.poster_url === "string" || value.poster_url === null)
  );
}

function isTicketSession(value: unknown): value is UserTicket["session"] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.start_time === "string" &&
    typeof value.end_time === "string"
  );
}

function isTicketRoom(value: unknown): value is UserTicket["room"] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isTicketSeat(value: unknown): value is UserTicket["seat"] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.row === "string" &&
    typeof value.number === "number" &&
    typeof value.identifier === "string"
  );
}

function isTicketType(value: unknown): value is UserTicket["ticket_type"] {
  return value === "inteira" || value === "meia";
}

function isPaymentMethod(value: unknown): value is UserTicket["payment_method"] {
  return value === "cartao_credito" || value === "pix";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
