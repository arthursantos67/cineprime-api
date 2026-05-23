"use client";

import Link from "next/link";

import { StateMessage } from "@/components/ui/StateMessage";
import { useReservation } from "@/contexts/ReservationContext";
import { formatCurrency, formatDateTime } from "@/utils/formatters";

import {
  paymentMethodLabels,
  ticketTypeLabels,
} from "./order-summary";

export function CheckoutConfirmation() {
  const { checkoutResult } = useReservation();

  if (!checkoutResult || checkoutResult.tickets.length === 0) {
    return (
      <StateMessage
        action={
          <Link className="button button-primary" href="/">
            Voltar ao catálogo
          </Link>
        }
        title="Nenhum ingresso em memória"
      >
        Finalize uma compra para visualizar a confirmação nesta sessão.
      </StateMessage>
    );
  }

  return (
    <section
      aria-labelledby="ingressos-gerados"
      className="confirmation-tickets"
    >
      <div className="confirmation-tickets__heading">
        <div>
          <h2 id="ingressos-gerados">Compra confirmada</h2>
          <p>
            {checkoutResult.tickets.length} ingresso
            {checkoutResult.tickets.length === 1 ? "" : "s"} gerado
            {checkoutResult.tickets.length === 1 ? "" : "s"} com pagamento em{" "}
            {paymentMethodLabels[checkoutResult.payment_method]}.
          </p>
        </div>
        <strong>{formatCurrency(Number(checkoutResult.total_amount))}</strong>
      </div>

      <div className="confirmation-tickets__list">
        {checkoutResult.tickets.map((ticket) => (
          <article className="confirmation-ticket" key={ticket.ticket_id}>
            <div className="confirmation-ticket__header">
              <div>
                <h3>{ticket.movie.title}</h3>
                <p>{formatDateTime(ticket.session.start_time)}</p>
              </div>
              <span>{ticket.ticket_code}</span>
            </div>

            <dl className="confirmation-ticket__details">
              <div>
                <dt>Sala</dt>
                <dd>{ticket.room.name}</dd>
              </div>
              <div>
                <dt>Assento</dt>
                <dd>{ticket.seat.identifier}</dd>
              </div>
              <div>
                <dt>Ingresso</dt>
                <dd>{ticketTypeLabels[ticket.ticket_type]}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>{formatCurrency(Number(ticket.amount_paid))}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
