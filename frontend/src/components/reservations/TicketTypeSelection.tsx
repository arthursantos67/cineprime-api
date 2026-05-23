"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useReservation } from "@/contexts/ReservationContext";
import type { ReservedSeat, TicketType } from "@/types/reservation";
import { formatCurrency } from "@/utils/formatters";

import {
  buildTicketTypeSelectionRows,
  calculateTicketTypeSubtotal,
  ticketTypeOptions,
} from "./ticket-type-selection";

type TicketTypeSelectionFormProps = {
  onTicketTypeChange: (sessionSeatId: string, type: TicketType) => void;
  reservedSeats: ReservedSeat[];
  ticketTypes: Record<string, TicketType>;
};

export function TicketTypeSelection() {
  const reservation = useReservation();

  return (
    <TicketTypeSelectionForm
      onTicketTypeChange={reservation.setTicketType}
      reservedSeats={reservation.reservedSeats}
      ticketTypes={reservation.ticketTypes}
    />
  );
}

export function TicketTypeSelectionForm({
  onTicketTypeChange,
  reservedSeats,
  ticketTypes,
}: TicketTypeSelectionFormProps) {
  const [voucherCode, setVoucherCode] = useState("");
  const rows = useMemo(
    () => buildTicketTypeSelectionRows(reservedSeats, ticketTypes),
    [reservedSeats, ticketTypes]
  );
  const subtotal = calculateTicketTypeSubtotal(rows);

  return (
    <div className="ticket-types">
      <section
        aria-labelledby="ticket-types-heading"
        className="ticket-types__panel"
      >
        <div className="ticket-types__heading">
          <div>
            <h2 id="ticket-types-heading">Ingressos por assento</h2>
            <p>
              Escolha inteira ou meia-entrada para cada lugar reservado antes de
              avançar ao pagamento.
            </p>
          </div>
          <strong>{formatCurrency(subtotal)}</strong>
        </div>

        <div className="ticket-types__list" role="list">
          {rows.map((row) => (
            <fieldset
              className="ticket-types__seat"
              key={row.seat.sessionSeatId}
              role="listitem"
            >
              <legend>
                <span>Assento</span>
                <strong>{row.seatLabel}</strong>
                <small>
                  Fileira {row.seat.row}, assento {row.seat.number}
                </small>
              </legend>

              <div className="ticket-types__options" role="radiogroup">
                {ticketTypeOptions.map((option) => {
                  const optionPrice =
                    option.value === "meia" ? row.halfPrice : row.fullPrice;

                  return (
                    <label className="ticket-types__option" key={option.value}>
                      <input
                        checked={row.selectedTicketType === option.value}
                        name={`ticket-type-${row.seat.sessionSeatId}`}
                        onChange={() =>
                          onTicketTypeChange(
                            row.seat.sessionSeatId,
                            option.value
                          )
                        }
                        type="radio"
                        value={option.value}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                      <b>{formatCurrency(optionPrice)}</b>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <section aria-labelledby="voucher-heading" className="ticket-types__panel">
        <div className="ticket-types__heading">
          <div>
            <h2 id="voucher-heading">Cupom</h2>
            <p id="voucher-helper">
              O cupom não altera o subtotal nesta versão.
            </p>
          </div>
        </div>

        <label className="ticket-types__voucher">
          <span>Código promocional</span>
          <input
            aria-describedby="voucher-helper"
            autoComplete="off"
            name="voucher"
            onChange={(event) => setVoucherCode(event.target.value)}
            placeholder="Digite o cupom"
            type="text"
            value={voucherCode}
          />
        </label>
      </section>

      <div className="ticket-types__footer">
        <div>
          <span>Subtotal</span>
          <strong>{formatCurrency(subtotal)}</strong>
        </div>
        <Link className="button button-primary ticket-types__continue" href="/checkout">
          Continuar para pagamento
        </Link>
      </div>
    </div>
  );
}
