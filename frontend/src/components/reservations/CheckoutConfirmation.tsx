"use client";

import Link from "next/link";

import { TicketCard } from "@/components/tickets/TicketCard";
import { StateMessage } from "@/components/ui/StateMessage";
import { useReservation } from "@/contexts/ReservationContext";
import type { CheckoutResponse } from "@/types/reservation";
import { formatCurrency } from "@/utils/formatters";

import { paymentMethodLabels } from "./order-summary";

export function CheckoutConfirmation() {
  const { checkoutResult } = useReservation();

  return <CheckoutConfirmationContent checkoutResult={checkoutResult} />;
}

export function CheckoutConfirmationContent({
  checkoutResult,
}: {
  checkoutResult: CheckoutResponse | null;
}) {
  if (!checkoutResult || checkoutResult.tickets.length === 0) {
    return (
      <StateMessage
        action={
          <Link className="button button-primary" href="/my-tickets">
            Ver meus ingressos
          </Link>
        }
        title="Confirmação indisponível"
      >
        Os dados desta confirmação ficam apenas na memória da sessão. Se a
        página foi recarregada, consulte seus ingressos em Meus Ingressos.
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
            Sua compra foi concluída com sucesso. {checkoutResult.tickets.length}{" "}
            ingresso{checkoutResult.tickets.length === 1 ? "" : "s"} gerado
            {checkoutResult.tickets.length === 1 ? "" : "s"} com pagamento em{" "}
            {paymentMethodLabels[checkoutResult.payment_method]}.
          </p>
        </div>
        <strong>{formatCurrency(Number(checkoutResult.total_amount))}</strong>
      </div>

      <div className="confirmation-tickets__list" role="list">
        {checkoutResult.tickets.map((ticket) => (
          <div key={ticket.ticket_id} role="listitem">
            <TicketCard ticket={ticket} />
          </div>
        ))}
      </div>

      <div className="confirmation-tickets__actions">
        <Link className="button button-primary" href="/my-tickets">
          Ir para Meus Ingressos
        </Link>
      </div>
    </section>
  );
}
