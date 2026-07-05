"use client";

import Link from "next/link";

import { TicketCard } from "@/components/tickets/TicketCard";
import { StateMessage } from "@/components/ui/StateMessage";
import { cn } from "@/components/ui/classNames";
import { useReservation } from "@/contexts/ReservationContext";
import { useI18n } from "@/i18n";
import type { CheckoutResponse } from "@/types/reservation";
import { formatCurrency } from "@/utils/formatters";

import { getPaymentMethodLabel } from "./order-summary";

export function CheckoutConfirmation() {
  const { checkoutResult } = useReservation();

  return <CheckoutConfirmationContent checkoutResult={checkoutResult} />;
}

export function CheckoutConfirmationContent({
  checkoutResult,
}: {
  checkoutResult: CheckoutResponse | null;
}) {
  const { locale, t } = useI18n();

  if (!checkoutResult || checkoutResult.tickets.length === 0) {
    return (
      <StateMessage
        action={
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-brand bg-brand px-3.5 text-sm font-extrabold leading-none text-white transition hover:bg-brand-strong"
            href="/profile?tab=ingressos"
          >
            {t("nav.myTickets")}
          </Link>
        }
        title={t("checkout.confirmationUnavailable")}
      >
        {t("confirmation.unavailableDescription")}
      </StateMessage>
    );
  }

  return (
    <section
      aria-labelledby="ingressos-gerados"
      className="confirmation-tickets grid gap-4 rounded-card border border-white/10 bg-[linear-gradient(180deg,rgb(255_255_255_/_5%),rgb(255_255_255_/_2%))] p-5 text-text shadow-[0_18px_54px_rgb(0_0_0_/_18%)]"
    >
      <div className="confirmation-tickets__heading grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3.5 max-lg:grid-cols-1">
        <div>
          <h2
            className="m-0 text-[21px] leading-tight text-white"
            id="ingressos-gerados"
          >
            {t("confirmation.purchaseConfirmed")}
          </h2>
          <p className="m-0 mt-1.5 leading-6 text-text/65">
            {t("confirmation.successDescription", {
              count: checkoutResult.tickets.length,
              generatedWord:
                checkoutResult.tickets.length === 1
                  ? t("checkout.ticketsGeneratedSingular")
                  : t("checkout.ticketsGeneratedPlural"),
              paymentMethod: getPaymentMethodLabel(
                checkoutResult.payment_method,
                locale
              ),
              ticketWord:
                checkoutResult.tickets.length === 1
                  ? t("checkout.ticketSingular")
                  : t("checkout.ticketPlural"),
            })}
          </p>
        </div>
        <strong className="inline-flex min-h-[38px] items-center whitespace-nowrap rounded-md border border-brand/50 bg-brand/20 px-3 py-1.5 text-xl text-white">
          {formatCurrency(Number(checkoutResult.total_amount), locale)}
        </strong>
      </div>

      <div className="confirmation-tickets__list grid gap-2.5" role="list">
        {checkoutResult.tickets.map((ticket) => (
          <div key={ticket.ticket_id} role="listitem">
            <TicketCard ticket={ticket} />
          </div>
        ))}
      </div>

      <div className="confirmation-tickets__actions flex justify-end">
        <Link
          className={cn(
            "inline-flex min-h-10 items-center justify-center rounded-md border border-brand bg-brand px-3.5 text-sm font-extrabold leading-none text-white transition hover:bg-brand-strong",
            "max-sm:w-full"
          )}
          href="/profile?tab=ingressos"
        >
          {t("confirmation.goToMyTickets")}
        </Link>
      </div>
    </section>
  );
}
