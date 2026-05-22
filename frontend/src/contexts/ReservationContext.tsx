"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AUTH_PROTECTED_STATE_RESET_EVENT } from "./AuthContext";
import {
  addSeatsToReservation,
  initialReservationState,
  removeSeatFromReservation,
  resetReservation as getResetReservationState,
  setReservationPaymentMethod,
  setReservationTicketType,
  type ReservationState,
} from "./reservation-state";
import type {
  PaymentMethod,
  ReservedSeat,
  TicketType,
} from "@/types/reservation";

type ReservationContextValue = ReservationState & {
  addSeats: (
    seats: ReservedSeat[],
    options?: { defaultTicketType?: TicketType; sessionId?: string }
  ) => void;
  removeSeat: (sessionSeatId: string) => void;
  resetReservation: () => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setTicketType: (sessionSeatId: string, type: TicketType) => void;
};

const ReservationContext = createContext<ReservationContextValue | null>(null);

export function ReservationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReservationState>(initialReservationState);

  const addSeats = useCallback(
    (
      seats: ReservedSeat[],
      {
        defaultTicketType,
        sessionId,
      }: { defaultTicketType?: TicketType; sessionId?: string } = {}
    ) => {
      setState((currentState) =>
        addSeatsToReservation(
          currentState,
          seats,
          sessionId,
          defaultTicketType
        )
      );
    },
    []
  );

  const removeSeat = useCallback((sessionSeatId: string) => {
    setState((currentState) =>
      removeSeatFromReservation(currentState, sessionSeatId)
    );
  }, []);

  const setTicketType = useCallback(
    (sessionSeatId: string, type: TicketType) => {
      setState((currentState) =>
        setReservationTicketType(currentState, sessionSeatId, type)
      );
    },
    []
  );

  const setPaymentMethod = useCallback((method: PaymentMethod) => {
    setState((currentState) => setReservationPaymentMethod(currentState, method));
  }, []);

  const resetReservation = useCallback(() => {
    setState(getResetReservationState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener(AUTH_PROTECTED_STATE_RESET_EVENT, resetReservation);

    return () => {
      window.removeEventListener(
        AUTH_PROTECTED_STATE_RESET_EVENT,
        resetReservation
      );
    };
  }, [resetReservation]);

  const value = useMemo(
    () => ({
      ...state,
      addSeats,
      removeSeat,
      resetReservation,
      setPaymentMethod,
      setTicketType,
    }),
    [
      addSeats,
      removeSeat,
      resetReservation,
      setPaymentMethod,
      setTicketType,
      state,
    ]
  );

  return (
    <ReservationContext.Provider value={value}>
      {children}
    </ReservationContext.Provider>
  );
}

export function useReservation() {
  const context = useContext(ReservationContext);

  if (!context) {
    throw new Error("useReservation deve ser usado dentro de ReservationProvider.");
  }

  return context;
}
