"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, getApiErrorUserMessage } from "@/api/client";
import { catalogApi } from "@/api/catalog";
import { reservationApi } from "@/api/reservation";
import { useGuardedAction } from "@/components/auth/useGuardedAction";
import { StateMessage } from "@/components/ui/StateMessage";
import { useReservation } from "@/contexts/ReservationContext";
import { useReservationCountdown } from "@/hooks/useReservationCountdown";
import type {
  ReservedSeat,
  SessionSeatMapItem,
  TemporaryReservationResponse,
} from "@/types/reservation";

type SeatMapLoadState =
  | { status: "error"; errorMessage?: string }
  | { status: "loading" }
  | { seats: SessionSeatMapItem[]; sessionBasePrice: number; status: "success" };

export type SeatMapRow = {
  rowLabel: string;
  seats: SessionSeatMapItem[];
};

export type SeatMapDisplaySeat = {
  displayNumber: number;
  seat: SessionSeatMapItem;
};

export type SeatMapAccessiblePair = {
  accessibleSeat: SeatMapDisplaySeat;
  companionSeat?: SeatMapDisplaySeat;
};

export type SeatMapRenderedRow = SeatMapRow & {
  leftSeats: SeatMapDisplaySeat[];
  rightSeats: SeatMapDisplaySeat[];
};

export type SeatMapLayoutModel = {
  accessibleLeftPairs: SeatMapAccessiblePair[];
  accessibleRightPairs: SeatMapAccessiblePair[];
  rows: SeatMapRenderedRow[];
};

export type SeatVisualState =
  | "available"
  | "purchased"
  | "reserved"
  | "selected";

type SeatMapProps = {
  sessionId: string;
};

type SeatMapViewProps = {
  sessionBasePrice: number;
  sessionId: string;
  seats: SessionSeatMapItem[];
};

type SeatMapLayoutProps = {
  errorMessage?: string | null;
  onSeatToggle?: (seat: SessionSeatMapItem) => void;
  pendingSeatIds?: ReadonlySet<string>;
  seats: SessionSeatMapItem[];
  selectedSeatIds?: ReadonlySet<string>;
};

const seatStateLabels: Record<SeatVisualState, string> = {
  available: "Disponível",
  purchased: "Comprado",
  reserved: "Reservado ou indisponível",
  selected: "Selecionado",
};

const seatStateMarkers: Record<SeatVisualState, string> = {
  available: "",
  purchased: "C",
  reserved: "R",
  selected: "",
};

const ACCESSIBLE_SEAT_COUNT = 6;
const ACCESSIBLE_SEATS_PER_SIDE = 3;

export function SeatMap({ sessionId }: SeatMapProps) {
  const [state, setState] = useState<SeatMapLoadState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  const trimmedSessionId = sessionId.trim();

  useEffect(() => {
    let isActive = true;

    if (!trimmedSessionId) {
      setState({ errorMessage: "Sessão inválida.", status: "error" });
      return;
    }

    async function fetchSeatMap() {
      setState({ status: "loading" });

      try {
        const [seats, session] = await Promise.all([
          reservationApi.getSeatMap(trimmedSessionId),
          catalogApi.getSession(trimmedSessionId),
        ]);
        const sessionBasePrice = Number(session.base_price);

        if (isActive) {
          setState({
            seats,
            sessionBasePrice: Number.isFinite(sessionBasePrice)
              ? sessionBasePrice
              : 0,
            status: "success",
          });
        }
      } catch (error) {
        if (isActive) {
          setState({
            errorMessage: getApiErrorUserMessage(error),
            status: "error",
          });
        }
      }
    }

    void fetchSeatMap();

    return () => {
      isActive = false;
    };
  }, [trimmedSessionId, retryCount]);

  const handleRetry = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  if (state.status === "loading") {
    return (
      <StateMessage tone="loading" title="Carregando mapa de assentos">
        Buscando a disposição da sala para esta sessão.
      </StateMessage>
    );
  }

  if (state.status === "error") {
    return (
      <StateMessage
        action={
          <button className="button button-ghost" onClick={handleRetry} type="button">
            Tentar novamente
          </button>
        }
        title="Mapa indisponível"
        tone="error"
      >
        {state.errorMessage ??
          "Não conseguimos carregar os assentos desta sessão agora."}
      </StateMessage>
    );
  }

  return (
    <SeatMapView
      seats={state.seats}
      sessionBasePrice={state.sessionBasePrice}
      sessionId={sessionId.trim()}
    />
  );
}

export function SeatMapView({
  seats,
  sessionBasePrice,
  sessionId,
}: SeatMapViewProps) {
  const guardAction = useGuardedAction();
  const reservation = useReservation();
  const [currentSeats, setCurrentSeats] = useState(seats);
  const [pendingSeatIds, setPendingSeatIds] = useState<Set<string>>(
    () => new Set()
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const reservationExpiresAt =
    reservation.sessionId === sessionId
      ? reservation.reservationExpiresAt
      : null;
  const countdown = useReservationCountdown(reservationExpiresAt);

  useEffect(() => {
    setCurrentSeats(seats);
  }, [seats]);

  const reservedSeatsForSession = useMemo(() => {
    if (reservation.sessionId !== sessionId) {
      return [];
    }

    return reservation.reservedSeats;
  }, [reservation.reservedSeats, reservation.sessionId, sessionId]);

  const selectedSeatIds = useMemo(
    () =>
      new Set([
        ...reservedSeatsForSession.map((seat) => seat.sessionSeatId),
        ...currentSeats
          .filter(
            (seat) =>
              seat.status === "RESERVED" &&
              seat.reserved_by_current_user === true
          )
          .map((seat) => seat.session_seat_id),
      ]),
    [currentSeats, reservedSeatsForSession]
  );

  useEffect(() => {
    if (!reservation.expirationNotice) {
      return;
    }

    if (
      reservation.expiredSessionId &&
      reservation.expiredSessionId !== sessionId
    ) {
      return;
    }

    setErrorMessage(reservation.expirationNotice);
    reservation.clearExpirationNotice();
  }, [reservation, sessionId]);

  useEffect(() => {
    if (!countdown?.isExpired || reservedSeatsForSession.length === 0) {
      return;
    }

    const expiredSessionSeatIds = reservedSeatsForSession.map(
      (seat) => seat.sessionSeatId
    );

    reservation.expireReservation();
    setCurrentSeats((current) =>
      markSeatsAsAvailableBySessionSeatIds(current, expiredSessionSeatIds)
    );
  }, [countdown?.isExpired, reservation, reservedSeatsForSession]);

  function toggleSeat(seat: SessionSeatMapItem) {
    if (pendingSeatIds.has(seat.session_seat_id)) {
      return;
    }

    const visualState = getSeatVisualState(seat, selectedSeatIds);

    if (visualState === "selected") {
      guardAction(() => {
        void releaseSeat(seat);
      });
      return;
    }

    if (visualState !== "available") {
      return;
    }

    guardAction(() => {
      void reserveSeat(seat);
    });
  }

  async function reserveSeat(seat: SessionSeatMapItem) {
    setErrorMessage(null);
    setPendingSeatIds((current) => addToSet(current, seat.session_seat_id));
    setCurrentSeats((current) =>
      markSeatsAsReservedBySeatIds(current, [seat.seat_id])
    );

    try {
      const response = await reservationApi.reserveSeats(sessionId, [
        seat.seat_id,
      ]);
      const nextSeats = buildReservedSeatsFromReservation(
        response,
        currentSeats,
        sessionBasePrice,
        response.expires_at
      );

      reservation.addSeats(nextSeats, { sessionId });
      setCurrentSeats((current) =>
        markSeatsAsReservedBySeatIds(
          current,
          response.seats.map((responseSeat) => responseSeat.seat_id),
          response.expires_at
        )
      );
    } catch (error) {
      setCurrentSeats((current) =>
        restoreSeatSnapshots(current, [seat])
      );
      setErrorMessage(getSeatInteractionErrorMessage(error));
    } finally {
      setPendingSeatIds((current) =>
        removeFromSet(current, seat.session_seat_id)
      );
    }
  }

  async function releaseSeat(seat: SessionSeatMapItem) {
    const reservedSeat = reservedSeatsForSession.find(
      (currentSeat) => currentSeat.sessionSeatId === seat.session_seat_id
    );

    setErrorMessage(null);
    setPendingSeatIds((current) => addToSet(current, seat.session_seat_id));
    reservation.removeSeat(seat.session_seat_id);
    setCurrentSeats((current) =>
      markSeatsAsAvailableBySessionSeatIds(current, [seat.session_seat_id])
    );

    try {
      const response = await reservationApi.releaseReservations(sessionId, [
        seat.session_seat_id,
      ]);
      const releasedSessionSeatIds = response.seats.map(
        (responseSeat) => responseSeat.session_seat_id
      );

      setCurrentSeats((current) =>
        markSeatsAsAvailableBySessionSeatIds(current, releasedSessionSeatIds)
      );
    } catch (error) {
      setCurrentSeats((current) =>
        restoreSeatSnapshots(current, [seat])
      );

      if (reservedSeat) {
        reservation.addSeats([reservedSeat], { sessionId });
      }

      setErrorMessage(getSeatInteractionErrorMessage(error));
    } finally {
      setPendingSeatIds((current) =>
        removeFromSet(current, seat.session_seat_id)
      );
    }
  }

  return (
    <SeatMapLayout
      errorMessage={errorMessage}
      onSeatToggle={toggleSeat}
      pendingSeatIds={pendingSeatIds}
      seats={currentSeats}
      selectedSeatIds={selectedSeatIds}
    />
  );
}

export function SeatMapLayout({
  errorMessage,
  onSeatToggle,
  pendingSeatIds = new Set(),
  seats,
  selectedSeatIds = new Set(),
}: SeatMapLayoutProps) {
  const layout = useMemo(() => buildSeatMapLayout(seats), [seats]);

  if (seats.length === 0) {
    return (
      <StateMessage title="Sala sem assentos">
        Ainda não há assentos cadastrados para esta sessão.
      </StateMessage>
    );
  }

  return (
    <section aria-labelledby="mapa-assentos" className="seat-map-section">
      <div className="seat-map-section__header">
        <h2 id="mapa-assentos">Mapa de assentos</h2>
        <p>
          Visitantes podem consultar a sala. Para reservar ou liberar assentos,
          entre na sua conta.
        </p>
        <p className="sr-only" id="mapa-assentos-instrucoes">
          Em telas estreitas, role horizontalmente para acessar todos os
          assentos. Use Tab para chegar aos assentos e Enter ou Espaço para
          selecionar ou liberar um assento disponível.
        </p>
      </div>

      <SeatMapLegend />

      {errorMessage ? (
        <p className="inline-status inline-status-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div
        aria-describedby="mapa-assentos-instrucoes"
        aria-label="Área rolável do mapa de assentos"
        className="seat-map-scroll"
        tabIndex={0}
      >
        <div
          aria-label="Mapa interativo de assentos da sessão"
          className="seat-map"
        >
          <div className="seat-map__screen">Tela</div>

          <div
            aria-label="Assentos acessíveis e prioritários"
            className="seat-map__accessible-row"
            role="group"
          >
            <span aria-hidden="true" className="seat-map__row-label" />
            <div className="seat-map__accessible-list">
              <div className="seat-map__accessible-group seat-map__accessible-group--left">
                {layout.accessibleLeftPairs.map((pair) =>
                  renderAccessiblePair({
                    companionFirst: true,
                    onSeatToggle,
                    pair,
                    pendingSeatIds,
                    selectedSeatIds,
                  })
                )}
              </div>
              <div className="seat-map__accessible-group seat-map__accessible-group--right">
                {layout.accessibleRightPairs.map((pair) =>
                  renderAccessiblePair({
                    onSeatToggle,
                    pair,
                    pendingSeatIds,
                    selectedSeatIds,
                  })
                )}
              </div>
            </div>
            <span aria-hidden="true" className="seat-map__row-label" />
          </div>

          <div className="seat-map__rows">
            {layout.rows.map((row) => (
              <div className="seat-map__row" key={row.rowLabel}>
                <span
                  aria-hidden="true"
                  className="seat-map__row-label"
                >
                  {row.rowLabel}
                </span>
                <div
                  aria-label={`Fileira ${row.rowLabel}`}
                  className="seat-map__seat-list"
                  role="group"
                >
                  <div className="seat-map__seat-group seat-map__seat-group--left">
                    {row.leftSeats.map((seat) =>
                      renderSeatButton({
                        displayNumber: seat.displayNumber,
                        key: seat.seat.session_seat_id,
                        onSeatToggle,
                        pendingSeatIds,
                        seat: seat.seat,
                        selectedSeatIds,
                      })
                    )}
                  </div>
                  <span aria-hidden="true" className="seat-map__center-aisle" />
                  <div className="seat-map__seat-group seat-map__seat-group--right">
                    {row.rightSeats.map((seat) =>
                      renderSeatButton({
                        displayNumber: seat.displayNumber,
                        key: seat.seat.session_seat_id,
                        onSeatToggle,
                        pendingSeatIds,
                        seat: seat.seat,
                        selectedSeatIds,
                      })
                    )}
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  className="seat-map__row-label"
                >
                  {row.rowLabel}
                </span>
              </div>
            ))}
          </div>

          <div className="seat-map__back-label">Fundo da sala</div>
        </div>
      </div>
    </section>
  );
}

function renderAccessiblePair({
  companionFirst = false,
  onSeatToggle,
  pair,
  pendingSeatIds,
  selectedSeatIds,
}: {
  companionFirst?: boolean;
  onSeatToggle?: (seat: SessionSeatMapItem) => void;
  pair: SeatMapAccessiblePair;
  pendingSeatIds: ReadonlySet<string>;
  selectedSeatIds: ReadonlySet<string>;
}) {
  const accessibleSeatButton = renderSeatButton({
    displayNumber: pair.accessibleSeat.displayNumber,
    key: `${pair.accessibleSeat.seat.session_seat_id}-accessible`,
    onSeatToggle,
    pendingSeatIds,
    seat: pair.accessibleSeat.seat,
    selectedSeatIds,
  });
  const companionSeatButton = pair.companionSeat
    ? renderSeatButton({
        displayLabel: "AC",
        isCompanion: true,
        key: `${pair.companionSeat.seat.session_seat_id}-companion`,
        onSeatToggle,
        pendingSeatIds,
        seat: pair.companionSeat.seat,
        selectedSeatIds,
      })
    : null;

  return (
    <span
      className="seat-map__accessible-pair"
      key={pair.accessibleSeat.seat.session_seat_id}
    >
      {companionFirst ? companionSeatButton : accessibleSeatButton}
      {companionFirst ? accessibleSeatButton : companionSeatButton}
    </span>
  );
}

function renderSeatButton({
  displayLabel,
  displayNumber,
  isCompanion = false,
  key,
  onSeatToggle,
  pendingSeatIds,
  seat,
  selectedSeatIds,
}: {
  displayLabel?: string;
  displayNumber?: number;
  isCompanion?: boolean;
  key: string;
  onSeatToggle?: (seat: SessionSeatMapItem) => void;
  pendingSeatIds: ReadonlySet<string>;
  seat: SessionSeatMapItem;
  selectedSeatIds: ReadonlySet<string>;
}) {
  const visualState = getSeatVisualState(seat, selectedSeatIds);
  const isSelected = visualState === "selected";
  const isUnavailable =
    visualState === "reserved" || visualState === "purchased";
  const isPending = pendingSeatIds.has(seat.session_seat_id);
  const stateMarker = isCompanion ? "" : seatStateMarkers[visualState];

  return (
    <button
      aria-busy={isPending}
      aria-disabled={isUnavailable || isPending}
      aria-label={
        isCompanion
          ? getCompanionSeatAccessibleLabel(seat, visualState)
          : getSeatAccessibleLabel(seat, visualState)
      }
      aria-pressed={isSelected}
      className={[
        "seat-map__seat",
        `seat-map__seat--${visualState}`,
        seat.is_accessible ? "seat-map__seat--accessible" : "",
        isCompanion ? "seat-map__seat--companion" : "",
        isPending ? "seat-map__seat--pending" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-state={visualState}
      key={key}
      onClick={() => onSeatToggle?.(seat)}
      type="button"
    >
      <span className="seat-map__seat-number">
        {displayLabel ?? displayNumber ?? seat.number}
      </span>
      {stateMarker ? (
        <span aria-hidden="true" className="seat-map__seat-marker">
          {stateMarker}
        </span>
      ) : null}
      {seat.is_accessible && !isCompanion ? (
        <span aria-hidden="true" className="seat-map__seat-accessible">
          ♿
        </span>
      ) : null}
    </button>
  );
}

export function SeatMapLegend() {
  const legendItems: Array<{
    className: string;
    label: string;
    marker: string;
  }> = [
    {
      className: "seat-map__legend-swatch--available",
      label: "Disponível",
      marker: seatStateMarkers.available,
    },
    {
      className: "seat-map__legend-swatch--selected",
      label: "Selecionado",
      marker: seatStateMarkers.selected,
    },
    {
      className: "seat-map__legend-swatch--reserved",
      label: "Reservado ou indisponível",
      marker: seatStateMarkers.reserved,
    },
    {
      className: "seat-map__legend-swatch--purchased",
      label: "Comprado",
      marker: seatStateMarkers.purchased,
    },
    {
      className: "seat-map__legend-swatch--accessible",
      label: "Acessível",
      marker: "♿",
    },
    {
      className: "seat-map__legend-swatch--companion",
      label: "Acompanhante",
      marker: "AC",
    },
  ];

  return (
    <ul aria-label="Legenda dos assentos" className="seat-map__legend">
      {legendItems.map((item) => (
        <li className="seat-map__legend-item" key={item.label}>
          <span
            aria-hidden="true"
            className={[
              "seat-map__legend-swatch",
              item.className,
            ].join(" ")}
          >
            {item.marker}
          </span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function groupSeatMapRows(
  seats: SessionSeatMapItem[]
): SeatMapRow[] {
  const rowsByLabel = new Map<string, SessionSeatMapItem[]>();

  for (const seat of seats) {
    const existingSeats = rowsByLabel.get(seat.row) ?? [];
    existingSeats.push(seat);
    rowsByLabel.set(seat.row, existingSeats);
  }

  return Array.from(rowsByLabel.entries())
    .sort(([leftRow], [rightRow]) => compareRowLabels(leftRow, rightRow))
    .map(([rowLabel, rowSeats]) => ({
      rowLabel,
      seats: [...rowSeats].sort((leftSeat, rightSeat) => {
        return compareSeatPositions(leftSeat, rightSeat);
      }),
    }));
}

export function buildSeatMapLayout(
  seats: SessionSeatMapItem[]
): SeatMapLayoutModel {
  const accessibleSeats = getAccessibleDisplaySeats(seats);
  const accessibleSeatIds = new Set(
    accessibleSeats.map((seat) => seat.session_seat_id)
  );
  const companionSeats = getCompanionDisplaySeats(seats, accessibleSeatIds);
  const reservedFrontSeatIds = new Set([
    ...accessibleSeats.map((seat) => seat.session_seat_id),
    ...companionSeats.map((seat) => seat.session_seat_id),
  ]);
  const roomRows = groupSeatMapRows(
    seats.filter((seat) => !reservedFrontSeatIds.has(seat.session_seat_id))
  );
  const accessiblePairs = pairAccessibleSeatsWithCompanions(
    withDisplayNumbers(accessibleSeats),
    withDisplayNumbers(companionSeats)
  );

  return {
    accessibleLeftPairs: accessiblePairs.slice(0, ACCESSIBLE_SEATS_PER_SIDE),
    accessibleRightPairs: accessiblePairs.slice(ACCESSIBLE_SEATS_PER_SIDE),
    rows: roomRows.map((row) => ({
      ...row,
      ...splitRowSeats(withDisplayNumbers(row.seats)),
    })),
  };
}

export function getSeatVisualState(
  seat: SessionSeatMapItem,
  selectedSeatIds: ReadonlySet<string>
): SeatVisualState {
  if (
    selectedSeatIds.has(seat.session_seat_id) ||
    (seat.status === "RESERVED" && seat.reserved_by_current_user === true)
  ) {
    return "selected";
  }

  if (seat.status === "PURCHASED") {
    return "purchased";
  }

  if (seat.status === "RESERVED") {
    return "reserved";
  }

  return "available";
}

export function getSeatAccessibleLabel(
  seat: SessionSeatMapItem,
  visualState: SeatVisualState
) {
  const identifier = `${seat.row}${seat.number}`;
  const accessibleSuffix = seat.is_accessible ? ", assento acessível" : "";

  return `Assento ${identifier}, fileira ${seat.row}, número ${seat.number}, ${seatStateLabels[visualState]}${accessibleSuffix}.`;
}

export function getCompanionSeatAccessibleLabel(
  seat: SessionSeatMapItem,
  visualState: SeatVisualState
) {
  const identifier = `${seat.row}${seat.number}`;

  return `Assento acompanhante ${identifier}, fileira ${seat.row}, número ${seat.number}, ${seatStateLabels[visualState]}.`;
}

export function buildReservedSeatsFromReservation(
  response: TemporaryReservationResponse,
  seatMap: SessionSeatMapItem[],
  basePrice: number,
  expiresAtValue = response.expires_at
): ReservedSeat[] {
  const expiresAt = new Date(expiresAtValue);
  const seatsBySeatId = new Map(seatMap.map((seat) => [seat.seat_id, seat]));

  return response.seats.map((reservedSeat) => {
    const originalSeat = seatsBySeatId.get(reservedSeat.seat_id);

    if (!originalSeat) {
      throw new Error("Reserved seat was not present in the loaded seat map.");
    }

    return {
      basePrice,
      expiresAt,
      isAccessible: originalSeat.is_accessible,
      number: reservedSeat.number,
      row: reservedSeat.row,
      seatId: reservedSeat.seat_id,
      sessionSeatId: originalSeat.session_seat_id,
    };
  });
}

export function markSeatsAsReservedBySeatIds(
  seats: SessionSeatMapItem[],
  seatIds: string[],
  lockExpiresAt: string | null = null
) {
  const seatIdsToReserve = new Set(seatIds);

  return seats.map((seat) =>
    seatIdsToReserve.has(seat.seat_id)
      ? {
          ...seat,
          lock_expires_at: lockExpiresAt,
          reserved_by_current_user: true,
          status: "RESERVED" as const,
        }
      : seat
  );
}

export function markSeatsAsAvailableBySessionSeatIds(
  seats: SessionSeatMapItem[],
  sessionSeatIds: string[]
) {
  const sessionSeatIdsToRelease = new Set(sessionSeatIds);

  return seats.map((seat) =>
    sessionSeatIdsToRelease.has(seat.session_seat_id)
      ? {
          ...seat,
          lock_expires_at: null,
          reserved_by_current_user: false,
          status: "AVAILABLE" as const,
        }
      : seat
  );
}

export function restoreSeatSnapshots(
  seats: SessionSeatMapItem[],
  snapshots: SessionSeatMapItem[]
) {
  const snapshotsBySessionSeatId = new Map(
    snapshots.map((seat) => [seat.session_seat_id, seat])
  );

  return seats.map(
    (seat) => snapshotsBySessionSeatId.get(seat.session_seat_id) ?? seat
  );
}

export function getSeatInteractionErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "SEAT_ALREADY_RESERVED") {
    return "Esse assento acabou de ser reservado por outra pessoa. Escolha outro lugar.";
  }

  return getApiErrorUserMessage(error);
}

function addToSet<T>(set: ReadonlySet<T>, value: T) {
  const nextSet = new Set(set);
  nextSet.add(value);
  return nextSet;
}

function removeFromSet<T>(set: ReadonlySet<T>, value: T) {
  const nextSet = new Set(set);
  nextSet.delete(value);
  return nextSet;
}

export function getCenterAisleAfterIndex(seatCount: number) {
  return seatCount > 4 ? Math.ceil(seatCount / 2) - 1 : -1;
}

function compareRowLabels(leftRow: string, rightRow: string) {
  return leftRow.localeCompare(rightRow, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function getAccessibleDisplaySeats(seats: SessionSeatMapItem[]) {
  const selectedSeatIds = new Set<string>();
  const selectedSeats: SessionSeatMapItem[] = [];

  for (const seat of seats
    .filter((seat) => seat.is_accessible)
    .sort(compareSeatPositions)) {
    if (selectedSeats.length >= ACCESSIBLE_SEAT_COUNT) {
      break;
    }

    selectedSeatIds.add(seat.session_seat_id);
    selectedSeats.push(seat);
  }

  for (const seat of getAccessibleFallbackSeats(seats, selectedSeatIds)) {
    if (selectedSeats.length >= ACCESSIBLE_SEAT_COUNT) {
      break;
    }

    selectedSeatIds.add(seat.session_seat_id);
    selectedSeats.push(seat);
  }

  return selectedSeats
    .sort(compareSeatPositions)
    .map((seat) => ({ ...seat, is_accessible: true }));
}

function getCompanionDisplaySeats(
  seats: SessionSeatMapItem[],
  selectedSeatIds: ReadonlySet<string>
) {
  return getAccessibleFallbackSeats(seats, selectedSeatIds)
    .slice(0, ACCESSIBLE_SEAT_COUNT)
    .sort(compareSeatPositions);
}

function pairAccessibleSeatsWithCompanions(
  accessibleSeats: SeatMapDisplaySeat[],
  companionSeats: SeatMapDisplaySeat[]
): SeatMapAccessiblePair[] {
  return accessibleSeats.map((accessibleSeat, index) => ({
    accessibleSeat,
    companionSeat: companionSeats[index],
  }));
}

function getAccessibleFallbackSeats(
  seats: SessionSeatMapItem[],
  selectedSeatIds: ReadonlySet<string>
) {
  const rows = groupSeatMapRows(
    seats.filter((seat) => !selectedSeatIds.has(seat.session_seat_id))
  ).sort((leftRow, rightRow) => {
    const widthComparison = rightRow.seats.length - leftRow.seats.length;

    if (widthComparison !== 0) {
      return widthComparison;
    }

    return compareRowLabels(rightRow.rowLabel, leftRow.rowLabel);
  });
  const fallbackSeats: SessionSeatMapItem[] = [];

  for (const row of rows) {
    for (const seat of getOuterSeatOrder(row.seats)) {
      fallbackSeats.push(seat);
    }
  }

  return fallbackSeats;
}

function getOuterSeatOrder(seats: SessionSeatMapItem[]) {
  const orderedSeats: SessionSeatMapItem[] = [];
  let leftIndex = 0;
  let rightIndex = seats.length - 1;

  while (leftIndex <= rightIndex) {
    orderedSeats.push(seats[leftIndex]);

    if (leftIndex !== rightIndex) {
      orderedSeats.push(seats[rightIndex]);
    }

    leftIndex += 1;
    rightIndex -= 1;
  }

  return orderedSeats;
}

function splitRowSeats(seats: SeatMapDisplaySeat[]) {
  const leftSeatCount = Math.ceil(seats.length / 2);

  return {
    leftSeats: seats.slice(0, leftSeatCount),
    rightSeats: seats.slice(leftSeatCount),
  };
}

function withDisplayNumbers(
  seats: SessionSeatMapItem[],
  startNumber = 1
): SeatMapDisplaySeat[] {
  return seats.map((seat, index) => ({
    displayNumber: startNumber + index,
    seat,
  }));
}

function compareSeatPositions(
  leftSeat: SessionSeatMapItem,
  rightSeat: SessionSeatMapItem
) {
  const rowComparison = compareRowLabels(leftSeat.row, rightSeat.row);

  if (rowComparison !== 0) {
    return rowComparison;
  }

  return leftSeat.number - rightSeat.number;
}
