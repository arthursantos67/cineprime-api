"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { StateMessage } from "@/components/ui/StateMessage";
import { useReservation } from "@/contexts/ReservationContext";
import { useReservationCountdown } from "@/hooks/useReservationCountdown";
import {
  getPurchaseFlowGuardDecision,
  PURCHASE_FLOW_MISSING_RESERVATION_MESSAGE,
} from "./purchase-flow-guards";

type PurchaseFlowGuardProps = {
  children: ReactNode;
};

export function PurchaseFlowGuard({ children }: PurchaseFlowGuardProps) {
  const router = useRouter();
  const reservation = useReservation();
  const countdown = useReservationCountdown(reservation.reservationExpiresAt);
  const hasReservedSeats = reservation.reservedSeats.length > 0;
  const decision = getPurchaseFlowGuardDecision({
    hasReservedSeats,
    isExpired: countdown?.isExpired ?? false,
    sessionId: reservation.sessionId,
  });

  useEffect(() => {
    if (!decision.shouldResetExpiredReservation) {
      return;
    }

    reservation.expireReservation(decision.message ?? undefined);

    if (decision.redirectPath) {
      router.replace(decision.redirectPath);
    }
  }, [
    decision.message,
    decision.redirectPath,
    decision.shouldResetExpiredReservation,
    reservation,
    router,
  ]);

  if (decision.renderContent) {
    return children;
  }

  const recoveryPath = reservation.expiredSessionId
    ? `/sessions/${encodeURIComponent(reservation.expiredSessionId)}/seats`
    : "/";
  const message = reservation.expirationNotice ?? decision.message;
  const tone =
    reservation.expirationNotice ||
    decision.message !== PURCHASE_FLOW_MISSING_RESERVATION_MESSAGE
      ? "error"
      : "empty";

  return (
    <StateMessage
      action={
        <Link className="button button-primary" href={recoveryPath}>
          {reservation.expiredSessionId
            ? "Escolher assentos"
            : "Voltar ao catálogo"}
        </Link>
      }
      tone={tone}
      title={decision.title ?? "Reserva indisponível"}
    >
      {message}
    </StateMessage>
  );
}
