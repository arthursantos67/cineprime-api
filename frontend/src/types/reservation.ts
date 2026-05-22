export type SessionSeatStatus = "AVAILABLE" | "RESERVED" | "PURCHASED";

export type TicketType = "inteira" | "meia";

export type PaymentMethod = "cartao_credito" | "pix";

export type SessionSeatMapItem = {
  session_seat_id: string;
  seat_id: string;
  row: string;
  number: number;
  status: SessionSeatStatus;
  is_accessible: boolean;
  reserved_by_current_user?: boolean;
  lock_expires_at?: string | null;
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
  basePrice: number;
  expiresAt: Date;
};
