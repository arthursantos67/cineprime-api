import { formatCurrency, formatDateTime } from "@/utils/formatters";

import {
  paymentMethodLabels,
  ticketTypeLabels,
} from "../reservations/order-summary";

export type TicketCardTicket = {
  amount_paid: string;
  movie: {
    title: string;
  };
  payment_method: keyof typeof paymentMethodLabels;
  room: {
    name: string;
  };
  seat: {
    identifier: string;
  };
  session: {
    start_time: string;
  };
  ticket_code: string;
  ticket_type: keyof typeof ticketTypeLabels;
};

type TicketCardProps = {
  ticket: TicketCardTicket;
  showVisualCode?: boolean;
};

export function TicketCard({ showVisualCode = true, ticket }: TicketCardProps) {
  return (
    <article className="ticket-card">
      <div className="ticket-card__header">
        <div>
          <h3>{ticket.movie.title}</h3>
          <p>{formatDateTime(ticket.session.start_time)}</p>
        </div>
        <span>{ticket.ticket_code}</span>
      </div>

      <dl className="ticket-card__details">
        <div>
          <dt>Sessão</dt>
          <dd>{formatDateTime(ticket.session.start_time)}</dd>
        </div>
        <div>
          <dt>Sala</dt>
          <dd>{ticket.room.name}</dd>
        </div>
        <div>
          <dt>Assento</dt>
          <dd>{ticket.seat.identifier}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{ticketTypeLabels[ticket.ticket_type]}</dd>
        </div>
        <div>
          <dt>Valor pago</dt>
          <dd>{formatCurrency(Number(ticket.amount_paid))}</dd>
        </div>
        <div>
          <dt>Pagamento</dt>
          <dd>{paymentMethodLabels[ticket.payment_method]}</dd>
        </div>
        <div>
          <dt>Código</dt>
          <dd>{ticket.ticket_code}</dd>
        </div>
      </dl>

      {showVisualCode ? (
        <div className="ticket-card__visual-code">
          <div
            aria-label={`Representação visual do ingresso ${ticket.ticket_code}`}
            className="ticket-card__barcode"
            role="img"
          >
            {buildDisplayOnlyBars(ticket.ticket_code).map((bar, index) => (
              <span
                className={`ticket-card__barcode-bar ticket-card__barcode-bar--${bar}`}
                key={`${ticket.ticket_code}-${index}`}
              />
            ))}
          </div>
          <p>Representação visual para conferência em tela.</p>
        </div>
      ) : null}
    </article>
  );
}

export function buildDisplayOnlyBars(ticketCode: string) {
  const source = ticketCode.trim() || "INGRESSO";
  const bars: Array<"narrow" | "medium" | "wide"> = [];

  for (const character of source) {
    const value = character.charCodeAt(0);

    bars.push(value % 2 === 0 ? "wide" : "narrow");
    bars.push(value % 3 === 0 ? "medium" : "narrow");
  }

  return bars.slice(0, 28).concat(["wide", "narrow", "medium"]);
}
