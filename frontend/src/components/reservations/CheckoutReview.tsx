"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { checkoutApi } from "@/api/checkout";
import { catalogApi } from "@/api/catalog";
import { SessionBadgeList } from "@/components/movies/SessionBadges";
import {
  getRoomDisplayName,
  getSessionBadges,
} from "@/components/movies/session-selection";
import { StateMessage } from "@/components/ui/StateMessage";
import { useReservation } from "@/contexts/ReservationContext";
import type { CatalogSession } from "@/types/catalog";
import type { PaymentMethod } from "@/types/reservation";
import { formatCurrency, formatDateTime } from "@/utils/formatters";

import {
  buildCheckoutPayload,
  getCheckoutErrorMessage,
  getCheckoutSubmitBlocker,
} from "./checkout-flow";
import {
  buildOrderSummaryItems,
  calculateOrderTotal,
  paymentMethodLabels,
} from "./order-summary";

type SessionDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { errorMessage: string; status: "error" }
  | { session: CatalogSession; status: "success" };

export const PAYMENT_METHODS: PaymentMethod[] = ["cartao_credito", "pix"];

export type PaymentMethodSelectorProps = {
  disabled?: boolean;
  onChange: (method: PaymentMethod) => void;
  selectedMethod: PaymentMethod | null;
};

export function PaymentMethodSelector({
  disabled = false,
  onChange,
  selectedMethod,
}: PaymentMethodSelectorProps) {
  return (
    <fieldset className="payment-methods">
      <legend className="sr-only">Forma de pagamento</legend>
      {PAYMENT_METHODS.map((method) => (
        <label className="payment-methods__option" key={method}>
          <input
            checked={selectedMethod === method}
            disabled={disabled}
            name="payment_method"
            onChange={() => onChange(method)}
            type="radio"
            value={method}
          />
          <span>
            <strong>{paymentMethodLabels[method]}</strong>
            <small>
              {method === "cartao_credito"
                ? "Finalize com cartão de crédito."
                : "Finalize com pagamento via PIX."}
            </small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function CheckoutReview() {
  const router = useRouter();
  const reservation = useReservation();
  const [sessionState, setSessionState] = useState<SessionDetailState>({
    status: reservation.sessionId ? "loading" : "idle",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const items = useMemo(
    () =>
      buildOrderSummaryItems(
        reservation.reservedSeats,
        reservation.ticketTypes
      ),
    [reservation.reservedSeats, reservation.ticketTypes]
  );
  const total = calculateOrderTotal(items);
  const session =
    sessionState.status === "success" ? sessionState.session : null;
  const sessionBadges = session ? getSessionBadges(session) : [];

  useEffect(() => {
    let isActive = true;

    async function loadSession(sessionId: string) {
      setSessionState({ status: "loading" });

      try {
        const loadedSession = await catalogApi.getSession(sessionId);

        if (isActive) {
          setSessionState({ session: loadedSession, status: "success" });
        }
      } catch {
        if (isActive) {
          setSessionState({
            errorMessage:
              "Não conseguimos carregar os detalhes da sessão. Você ainda pode revisar os assentos selecionados.",
            status: "error",
          });
        }
      }
    }

    if (reservation.sessionId) {
      void loadSession(reservation.sessionId);
    } else {
      setSessionState({ status: "idle" });
    }

    return () => {
      isActive = false;
    };
  }, [reservation.sessionId]);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const blocker = getCheckoutSubmitBlocker({
      paymentMethod: reservation.paymentMethod,
      reservedSeats: reservation.reservedSeats,
    });

    if (blocker) {
      setErrorMessage(blocker);
      return;
    }

    const paymentMethod = reservation.paymentMethod;

    if (!paymentMethod) {
      setErrorMessage("Escolha uma forma de pagamento para finalizar a compra.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const payload = buildCheckoutPayload({
        paymentMethod,
        reservedSeats: reservation.reservedSeats,
        ticketTypes: reservation.ticketTypes,
      });
      const checkoutResult = await checkoutApi.checkout(payload);

      reservation.storeCheckoutResult(checkoutResult);
      router.push("/confirmation");
    } catch (error) {
      setErrorMessage(getCheckoutErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      aria-describedby={errorMessage ? "checkout-review-error" : undefined}
      className="checkout-review"
      onSubmit={submitCheckout}
    >
      <section aria-labelledby="revisao-pedido" className="checkout-review__panel">
        <div className="checkout-review__heading">
          <div>
            <h2 id="revisao-pedido">Revise seu pedido</h2>
            <p>
              O total abaixo é informativo. A cobrança final é calculada pelo
              sistema no momento da confirmação.
            </p>
          </div>
          <strong>{formatCurrency(total)}</strong>
        </div>

        <CheckoutSessionDetails
          badges={sessionBadges}
          session={session}
        />

        {sessionState.status === "loading" ? (
          <p className="inline-status inline-status-info" role="status">
            Carregando detalhes da sessão...
          </p>
        ) : null}

        {sessionState.status === "error" ? (
          <p className="inline-status inline-status-error" role="alert">
            {sessionState.errorMessage}
          </p>
        ) : null}

        <div className="checkout-review__items" role="list">
          {items.map((item) => (
            <div
              className="checkout-review__item"
              key={item.seat.sessionSeatId}
              role="listitem"
            >
              <div>
                <span>Assento</span>
                <strong>{item.seatLabel}</strong>
              </div>
              <div>
                <span>Ingresso</span>
                <strong>{item.ticketTypeLabel}</strong>
              </div>
              <div>
                <span>Valor unitário</span>
                <strong>{formatCurrency(item.unitPrice)}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="forma-pagamento"
        className="checkout-review__panel"
      >
        <div className="checkout-review__heading">
          <div>
            <h2 id="forma-pagamento">Forma de pagamento</h2>
            <p>Escolha como deseja concluir este pedido.</p>
          </div>
        </div>

        <PaymentMethodSelector
          disabled={isSubmitting}
          onChange={(method) => {
            reservation.setPaymentMethod(method);
            setErrorMessage(null);
          }}
          selectedMethod={reservation.paymentMethod}
        />
      </section>

      {errorMessage ? (
        <div id="checkout-review-error">
          <StateMessage tone="error" title="Não foi possível finalizar">
            {errorMessage}
          </StateMessage>
        </div>
      ) : null}

      <button
        className="button button-primary checkout-review__submit"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Finalizando..." : "Confirmar compra"}
      </button>
    </form>
  );
}

export function CheckoutSessionDetails({
  badges,
  session,
}: {
  badges: ReturnType<typeof getSessionBadges>;
  session: CatalogSession | null;
}) {
  return (
    <dl className="checkout-review__session">
      <div>
        <dt>Filme</dt>
        <dd>{session?.movie.title ?? "Filme indisponível"}</dd>
      </div>
      <div>
        <dt>Sessão</dt>
        <dd>
          {session
            ? formatDateTime(session.start_time)
            : "Data e horário indisponíveis"}
        </dd>
      </div>
      <div>
        <dt>Sala</dt>
        <dd>{session ? getRoomDisplayName(session.room) : "Sala indisponível"}</dd>
      </div>
      {session ? (
        <div>
          <dt>Formato</dt>
          <dd>
            {badges.length > 0 ? (
              <SessionBadgeList
                badges={badges}
                className="checkout-review__badges"
              />
            ) : (
              "Formato padrão"
            )}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
