"use client";

import Link from "next/link";

import { useReservation } from "@/contexts/ReservationContext";
import { useReservationCountdown } from "@/hooks/useReservationCountdown";
import type {
  PaymentMethod,
  ReservedSeat,
  TicketType,
} from "@/types/reservation";
import { formatCurrency } from "@/utils/formatters";

import {
  buildOrderSummaryItems,
  calculateOrderTotal,
  paymentMethodLabels,
} from "./order-summary";

type ReservationOrderSummaryProps = {
  actionHref?: string;
  actionLabel?: string;
};

export type OrderSummaryPanelProps = ReservationOrderSummaryProps & {
  countdownExpired?: boolean;
  countdownLabel?: string | null;
  countdownWarning?: boolean;
  paymentMethod?: PaymentMethod | null;
  reservationExpiresAt?: Date | null;
  reservedSeats: ReservedSeat[];
  ticketTypes: Record<string, TicketType>;
};

export function ReservationOrderSummary({
  actionHref,
  actionLabel = "Continuar",
}: ReservationOrderSummaryProps) {
  const reservation = useReservation();
  const countdown = useReservationCountdown(reservation.reservationExpiresAt);

  return (
    <OrderSummaryPanel
      actionHref={actionHref}
      actionLabel={actionLabel}
      countdownExpired={countdown?.isExpired ?? false}
      countdownLabel={countdown ? `Expira em ${countdown.displayValue}` : null}
      countdownWarning={countdown?.isWarning ?? false}
      paymentMethod={reservation.paymentMethod}
      reservationExpiresAt={reservation.reservationExpiresAt}
      reservedSeats={reservation.reservedSeats}
      ticketTypes={reservation.ticketTypes}
    />
  );
}

export function OrderSummaryPanel({
  actionHref,
  actionLabel = "Continuar",
  countdownExpired = false,
  countdownLabel,
  countdownWarning = false,
  paymentMethod = null,
  reservationExpiresAt = null,
  reservedSeats,
  ticketTypes,
}: OrderSummaryPanelProps) {
  const items = buildOrderSummaryItems(
    reservedSeats,
    ticketTypes
  );
  const total = calculateOrderTotal(items);
  const hasSeats = items.length > 0;
  const paymentLabel = paymentMethod
    ? paymentMethodLabels[paymentMethod]
    : null;

  return (
    <aside aria-label="Resumo do pedido" className="order-summary">
      <div className="order-summary__header">
        <div>
          <h2>Resumo do pedido</h2>
          <p>
            {hasSeats
              ? `${items.length} assento${items.length === 1 ? "" : "s"} selecionado${items.length === 1 ? "" : "s"}`
              : "Nenhum assento selecionado"}
          </p>
        </div>
        <strong className="order-summary__total">{formatCurrency(total)}</strong>
      </div>

      {reservationExpiresAt ? (
        <p
          className={[
            "order-summary__timer",
            countdownWarning ? "order-summary__timer--warning" : "",
            countdownExpired ? "order-summary__timer--expired" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="timer"
        >
          {countdownExpired
            ? "Reserva expirada"
            : countdownLabel
              ? countdownLabel
              : "Reserva temporária ativa"}
        </p>
      ) : null}

      {hasSeats ? (
        <ul className="order-summary__list">
          {items.map((item) => (
            <li className="order-summary__item" key={item.seat.sessionSeatId}>
              <div>
                <strong>Assento {item.seatLabel}</strong>
                <span>{item.ticketTypeLabel}</span>
              </div>
              <span>{formatCurrency(item.unitPrice)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="order-summary__empty">
          Escolha os assentos para ver valores e tipos de ingresso.
        </p>
      )}

      <dl className="order-summary__details">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatCurrency(total)}</dd>
        </div>
        <div>
          <dt>Pagamento</dt>
          <dd>{paymentLabel ?? "A definir"}</dd>
        </div>
      </dl>

      {actionHref && hasSeats ? (
        <Link className="button button-primary order-summary__action" href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </aside>
  );
}
