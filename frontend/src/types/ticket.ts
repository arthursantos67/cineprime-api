import type { PaymentMethod, TicketType } from "./reservation";

export type TicketFilterType = "upcoming" | "past";

export type UserTicket = {
  ticket_id: string;
  ticket_code: string;
  ticket_type: TicketType;
  amount_paid: string;
  payment_method: PaymentMethod;
  created_at: string;
  movie: {
    id: string;
    title: string;
    poster_url: string | null;
  };
  session: {
    id: string;
    start_time: string;
    end_time: string;
  };
  room: {
    id: string;
    name: string;
  };
  seat: {
    id: string;
    row: string;
    number: number;
    identifier: string;
  };
};
