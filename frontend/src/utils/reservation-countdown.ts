export const RESERVATION_COUNTDOWN_WARNING_SECONDS = 60;

export type ReservationCountdownState = {
  displayValue: string;
  isExpired: boolean;
  isWarning: boolean;
  remainingSeconds: number;
};

export function getReservationCountdownState(
  expiresAt: Date | string | null,
  now: Date | number = new Date()
): ReservationCountdownState | null {
  if (!expiresAt) {
    return null;
  }

  const expiresAtTime =
    expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  const nowTime = now instanceof Date ? now.getTime() : now;

  if (!Number.isFinite(expiresAtTime) || !Number.isFinite(nowTime)) {
    return null;
  }

  const remainingSeconds = Math.max(
    0,
    Math.ceil((expiresAtTime - nowTime) / 1000)
  );

  return {
    displayValue: formatReservationCountdown(remainingSeconds),
    isExpired: remainingSeconds === 0,
    isWarning: remainingSeconds <= RESERVATION_COUNTDOWN_WARNING_SECONDS,
    remainingSeconds,
  };
}

export function formatReservationCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}
