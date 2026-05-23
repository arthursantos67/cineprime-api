import Link from "next/link";

import { StateMessage } from "@/components/ui/StateMessage";
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
  label: string;
  value: TicketFilterType | null;
}> = [
  { href: "/my-tickets", label: "Todos", value: null },
  { href: "/my-tickets?type=upcoming", label: "Próximos", value: "upcoming" },
  { href: "/my-tickets?type=past", label: "Anteriores", value: "past" },
];

export function MyTicketsContent({
  activeFilter,
  errorMessage,
  onRetry,
  status,
  tickets,
}: MyTicketsContentProps) {
  return (
    <section aria-labelledby="meus-ingressos" className="my-tickets">
      <div className="my-tickets__toolbar">
        <div>
          <h2 id="meus-ingressos">Ingressos da sua conta</h2>
          <p>{filterDescriptionLabels[activeFilter ?? "all"]}</p>
        </div>

        <nav aria-label="Filtros de ingressos" className="my-tickets__filters">
          {filterOptions.map((option) => {
            const isActive = option.value === activeFilter;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`button ${
                  isActive ? "button-secondary" : "button-ghost"
                }`}
                href={option.href}
                key={option.label}
              >
                {option.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {status === "loading" ? (
        <StateMessage tone="loading" title="Carregando ingressos">
          Aguarde enquanto buscamos seus ingressos.
        </StateMessage>
      ) : null}

      {status === "error" ? (
        <StateMessage
          action={
            onRetry ? (
              <button className="button button-primary" onClick={onRetry} type="button">
                Tentar novamente
              </button>
            ) : null
          }
          tone="error"
          title="Ingressos indisponíveis"
        >
          {errorMessage ?? "Não foi possível carregar seus ingressos agora."}
        </StateMessage>
      ) : null}

      {status === "success" && tickets.length === 0 ? (
        <StateMessage title={emptyStateLabels[activeFilter ?? "all"].title}>
          {emptyStateLabels[activeFilter ?? "all"].description}
        </StateMessage>
      ) : null}

      {status === "success" && tickets.length > 0 ? (
        <div className="my-tickets__list">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.ticket_id} ticket={ticket} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function TicketCard({ ticket }: { ticket: UserTicket }) {
  return <SharedTicketCard showVisualCode={false} ticket={ticket} />;
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
  all: "Veja todos os ingressos comprados.",
  past: "Exibindo sessões que já aconteceram.",
  upcoming: "Exibindo sessões futuras.",
};

const emptyStateLabels: Record<
  TicketFilterType | "all",
  { description: string; title: string }
> = {
  all: {
    description:
      "Quando você finalizar uma compra, seus ingressos aparecerão aqui.",
    title: "Você ainda não tem ingressos",
  },
  past: {
    description: "Nenhum ingresso anterior foi encontrado para sua conta.",
    title: "Nenhum ingresso anterior",
  },
  upcoming: {
    description: "Nenhum ingresso futuro foi encontrado para sua conta.",
    title: "Nenhum ingresso futuro",
  },
};
