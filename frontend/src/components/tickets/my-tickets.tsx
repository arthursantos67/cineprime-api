"use client";

import Link from "next/link";

import { StateMessage } from "@/components/ui/StateMessage";
import { cn } from "@/components/ui/classNames";
import { useI18n } from "@/i18n";
import type { TicketFilterType, UserTicket } from "@/types/ticket";

import { TicketCard as SharedTicketCard } from "./TicketCard";

export type MyTicketsStatus = "error" | "loading" | "success";

export type MyTicketsContentProps = {
  activeFilter: TicketFilterType | null;
  errorMessage?: string;
  onRetry?: () => void;
  status: MyTicketsStatus;
  tickets: UserTicket[];
};

const filterOptions: Array<{
  href: string;
  labelKey: string;
  value: TicketFilterType | null;
}> = [
  { href: "/profile?tab=ingressos", labelKey: "tickets.filterAll", value: null },
  { href: "/profile?tab=ingressos&type=upcoming", labelKey: "tickets.filterUpcoming", value: "upcoming" },
  { href: "/profile?tab=ingressos&type=past", labelKey: "tickets.filterPast", value: "past" },
];

export function MyTicketsContent({
  activeFilter,
  errorMessage,
  onRetry,
  status,
  tickets,
}: MyTicketsContentProps) {
  const { t } = useI18n();
  const activeFilterKey = activeFilter ?? "all";

  return (
    <section aria-labelledby="meus-ingressos" className="my-tickets grid gap-4">
      <div className="my-tickets__toolbar grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 rounded-card border border-white/10 bg-[linear-gradient(180deg,rgb(255_255_255_/_5%),rgb(255_255_255_/_2%))] p-5 text-text shadow-[0_18px_54px_rgb(0_0_0_/_18%)] max-lg:grid-cols-1">
        <div>
          <h2
            className="m-0 text-[21px] leading-tight text-white"
            id="meus-ingressos"
          >
            {t("tickets.accountTickets")}
          </h2>
          <p className="m-0 mt-1.5 leading-6 text-text/65">
            {t(filterDescriptionLabels[activeFilterKey])}
          </p>
        </div>

        <nav
          aria-label={t("tickets.filtersLabel")}
          className="my-tickets__filters flex flex-wrap items-center justify-end gap-2 max-lg:justify-start"
        >
          {filterOptions.map((option) => {
            const isActive = option.value === activeFilter;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center justify-center rounded-md border px-3.5 text-sm font-extrabold leading-none transition",
                  isActive
                    ? "border-accent bg-cinema-gold-soft text-[#3a2b00] hover:bg-accent"
                    : "border-white/15 bg-transparent text-text hover:bg-white/10"
                )}
                href={option.href}
                key={option.labelKey}
              >
                {t(option.labelKey)}
              </Link>
            );
          })}
        </nav>
      </div>

      {status === "loading" ? (
        <StateMessage tone="loading" title={t("tickets.loadingTitle")}>
          {t("tickets.loadingFetchDescription")}
        </StateMessage>
      ) : null}

      {status === "error" ? (
        <StateMessage
          action={
            onRetry ? (
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-brand bg-brand px-3.5 text-sm font-extrabold leading-none text-white transition hover:bg-brand-strong"
                onClick={onRetry}
                type="button"
              >
                {t("common.tryAgain")}
              </button>
            ) : null
          }
          tone="error"
          title={t("tickets.unavailableTitle")}
        >
          {errorMessage ?? t("tickets.unavailableDescription")}
        </StateMessage>
      ) : null}

      {status === "success" && tickets.length === 0 ? (
        <StateMessage title={t(emptyStateLabels[activeFilterKey].titleKey)}>
          {t(emptyStateLabels[activeFilterKey].descriptionKey)}
        </StateMessage>
      ) : null}

      {status === "success" && tickets.length > 0 ? (
        <div className="my-tickets__list grid gap-3" role="list">
          {tickets.map((ticket) => (
            <div key={ticket.ticket_id} role="listitem">
              <TicketCard ticket={ticket} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function TicketCard({ ticket }: { ticket: UserTicket }) {
  return <SharedTicketCard ticket={ticket} />;
}

export function getTicketFilterFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">
): TicketFilterType | null {
  const type = searchParams.get("type");

  if (type === "upcoming" || type === "past") {
    return type;
  }

  return null;
}

const filterDescriptionLabels: Record<TicketFilterType | "all", string> = {
  all: "tickets.filterAllDescription",
  past: "tickets.filterPastDescription",
  upcoming: "tickets.filterUpcomingDescription",
};

const emptyStateLabels: Record<
  TicketFilterType | "all",
  { descriptionKey: string; titleKey: string }
> = {
  all: {
    descriptionKey: "tickets.emptyAllDescription",
    titleKey: "tickets.emptyAllTitle",
  },
  past: {
    descriptionKey: "tickets.emptyPastDescription",
    titleKey: "tickets.emptyPastTitle",
  },
  upcoming: {
    descriptionKey: "tickets.emptyUpcomingDescription",
    titleKey: "tickets.emptyUpcomingTitle",
  },
};
