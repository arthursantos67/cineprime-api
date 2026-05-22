import type {
  PaymentMethod,
  ReservedSeat,
  TicketType,
} from "@/types/reservation";

export type OrderSummaryItem = {
  seat: ReservedSeat;
  seatLabel: string;
  ticketType: TicketType | null;
  ticketTypeLabel: string;
  unitPrice: number;
};

export const ticketTypeLabels: Record<TicketType, string> = {
  inteira: "Inteira",
  meia: "Meia-entrada",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cartao_credito: "Cartão de crédito",
  pix: "PIX",
};

export function formatSeatLabel(seat: Pick<ReservedSeat, "number" | "row">) {
  return `${seat.row}${seat.number}`;
}

export function calculateTicketUnitPrice(
  basePrice: number,
  ticketType?: TicketType | null
) {
  if (ticketType === "meia") {
    return roundCurrency(basePrice * 0.5);
  }

  return roundCurrency(basePrice);
}

export function buildOrderSummaryItems(
  reservedSeats: ReservedSeat[],
  ticketTypes: Record<string, TicketType>
): OrderSummaryItem[] {
  return reservedSeats.map((seat) => {
    const ticketType = ticketTypes[seat.sessionSeatId] ?? null;

    return {
      seat,
      seatLabel: formatSeatLabel(seat),
      ticketType,
      ticketTypeLabel: ticketType ? ticketTypeLabels[ticketType] : "A definir",
      unitPrice: calculateTicketUnitPrice(seat.basePrice, ticketType),
    };
  });
}

export function calculateOrderTotal(items: Pick<OrderSummaryItem, "unitPrice">[]) {
  return roundCurrency(
    items.reduce((total, item) => total + item.unitPrice, 0)
  );
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
