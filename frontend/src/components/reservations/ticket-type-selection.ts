import { DEFAULT_TICKET_TYPE } from "@/contexts/reservation-state";
import type { ReservedSeat, TicketType } from "@/types/reservation";

import {
  calculateOrderTotal,
  calculateTicketUnitPrice,
  formatSeatLabel,
  ticketTypeLabels,
} from "./order-summary";

export type TicketTypeOption = {
  description: string;
  label: string;
  value: TicketType;
};

export type TicketTypeSelectionRow = {
  fullPrice: number;
  halfPrice: number;
  seat: ReservedSeat;
  seatLabel: string;
  selectedTicketType: TicketType;
  unitPrice: number;
};

export const ticketTypeOptions: TicketTypeOption[] = [
  {
    description: "Valor integral da sessão",
    label: ticketTypeLabels.inteira,
    value: "inteira",
  },
  {
    description: "50% do valor integral",
    label: ticketTypeLabels.meia,
    value: "meia",
  },
];

export function buildTicketTypeSelectionRows(
  reservedSeats: ReservedSeat[],
  ticketTypes: Record<string, TicketType>
): TicketTypeSelectionRow[] {
  return reservedSeats.map((seat) => {
    const selectedTicketType =
      ticketTypes[seat.sessionSeatId] ?? DEFAULT_TICKET_TYPE;

    return {
      fullPrice: calculateTicketUnitPrice(seat.basePrice, "inteira"),
      halfPrice: calculateTicketUnitPrice(seat.basePrice, "meia"),
      seat,
      seatLabel: formatSeatLabel(seat),
      selectedTicketType,
      unitPrice: calculateTicketUnitPrice(seat.basePrice, selectedTicketType),
    };
  });
}

export function calculateTicketTypeSubtotal(
  rows: Pick<TicketTypeSelectionRow, "unitPrice">[]
) {
  return calculateOrderTotal(rows);
}
