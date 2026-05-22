"use client";

import { useEffect, useState } from "react";

import {
  getReservationCountdownState,
  type ReservationCountdownState,
} from "@/utils/reservation-countdown";

export function useReservationCountdown(
  expiresAt: Date | string | null
): ReservationCountdownState | null {
  const [countdown, setCountdown] = useState(() =>
    getReservationCountdownState(expiresAt)
  );

  useEffect(() => {
    function updateCountdown() {
      setCountdown(getReservationCountdownState(expiresAt));
    }

    updateCountdown();

    if (!expiresAt) {
      return;
    }

    const intervalId = window.setInterval(updateCountdown, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [expiresAt]);

  return countdown;
}
