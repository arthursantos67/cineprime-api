export type SessionSeatStatus = "AVAILABLE" | "RESERVED" | "PURCHASED";

export type TicketType = "inteira" | "meia" | "gratuito";

export type PaymentMethod = "cartao_credito" | "pix";

export type CheckoutSeatPayload = {
  session_seat_id: string;
  ticket_type: TicketType;
};

export type CheckoutPayload = {
  seats: CheckoutSeatPayload[];
  payment_method: PaymentMethod;
};

export type CheckoutSeatResponse = {
  session_seat_id: string;
  seat_id: string;
  row: string;
  number: number;
  status: SessionSeatStatus;
  ticket_type: TicketType;
  amount_paid: string;
};

export type CheckoutTicketResponse = {
  ticket_id: string;
  ticket_code: string;
  session_seat_id: string;
  seat_id: string;
  ticket_type: TicketType;
  amount_paid: string;
  payment_method: PaymentMethod;
  movie: {
    id: string;
    title: string;
    poster_url?: string | null;
    ticket_image_url?: string | null;
  };
  session: {
    id: string;
    start_time: string;
    end_time: string;
    projection_format?: string;
    audio_format?: string;
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

export type CheckoutResponse = {
  status: string;
  payment_method: PaymentMethod;
  total_amount: string;
  seats: CheckoutSeatResponse[];
  tickets: CheckoutTicketResponse[];
};

export type SessionSeatMapItem = {
  companion_seat_id: string | null;
  is_accessible: boolean;
  is_accessible_row: boolean;
  lock_expires_at?: string | null;
  number: number;
  reserved_by_current_user?: boolean;
  row: string;
  seat_id: string;
  session_seat_id: string;
  status: SessionSeatStatus;
};

export type SessionSeatMapResponse = SessionSeatMapItem[];

export type TemporaryReservationSeat = {
  seat_id: string;
  row: string;
  number: number;
  status: SessionSeatStatus;
};

export type TemporaryReservationResponse = {
  session_id: string;
  status: string;
  expires_at: string;
  seats: TemporaryReservationSeat[];
};

export type TemporaryReservationReleaseSeat = {
  session_seat_id: string;
  seat_id: string;
  row: string;
  number: number;
  status: SessionSeatStatus;
  is_accessible: boolean;
};

export type TemporaryReservationReleaseResponse = {
  session_id: string;
  status: string;
  seats: TemporaryReservationReleaseSeat[];
};

export type ReservedSeat = {
  sessionSeatId: string;
  seatId: string;
  row: string;
  number: number;
  isAccessible: boolean;
  isCompanion: boolean;
  basePrice: number;
  expiresAt: Date;
};
