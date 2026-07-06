"use client";

import React from "react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { User, ZoomIn, ZoomOut } from "lucide-react";

import { ApiError, getApiErrorUserMessage } from "@/api/client";
import { catalogApi } from "@/api/catalog";
import { reservationApi } from "@/api/reservation";
import { useGuardedAction } from "@/components/auth/useGuardedAction";
import { StateMessage } from "@/components/ui/StateMessage";
import { useReservation } from "@/contexts/ReservationContext";
import { useReservationCountdown } from "@/hooks/useReservationCountdown";
import { useI18n } from "@/i18n";
import type {
  ReservedSeat,
  SessionSeatMapItem,
  TemporaryReservationResponse,
} from "@/types/reservation";

type SeatMapLoadState =
  | { status: "error"; errorMessage?: string }
  | { status: "loading" }
  | { accessibleRowIndex: number | null; maxCenterSeatsPerRow: number | null; seats: SessionSeatMapItem[]; sessionBasePrice: number; status: "success" };

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
  leftNamoradeiras: SeatMapDisplaySeat[];
  rightNamoradeiras: SeatMapDisplaySeat[];
};

export type SeatMapLayoutModel = {
  accessibleLeftPairs: SeatMapAccessiblePair[];
  accessibleRightPairs: SeatMapAccessiblePair[];
  accessibleRowIndex: number;
  accessibleRowLabel: string | null;
  maxCenterSeatsPerRow: number | null;
  rows: SeatMapRenderedRow[];
};

export type SeatVisualState =
  | "available"
  | "purchased"
  | "reserved"
  | "selected";

type SeatAccessibleLabelOptions = {
  displayLabel?: string;
  displayNumber?: number;
  t?: Translate;
};

type SeatMapProps = {
  sessionId: string;
};

type SeatMapViewProps = {
  accessibleRowIndex?: number | null;
  maxCenterSeatsPerRow?: number | null;
  sessionBasePrice: number;
  sessionId: string;
  seats: SessionSeatMapItem[];
};

type SeatMapLayoutProps = {
  accessibleRowIndex?: number | null;
  errorMessage?: string | null;
  maxCenterSeatsPerRow?: number | null;
  onSeatToggle?: (seat: SessionSeatMapItem) => void;
  pendingSeatIds?: ReadonlySet<string>;
  seats: SessionSeatMapItem[];
  selectedSeatIds?: ReadonlySet<string>;
};

type Translate = (key: string, params?: Record<string, string | number>) => string;

const defaultSeatStateLabels: Record<SeatVisualState, string> = {
  available: "Disponível",
  purchased: "Comprado",
  reserved: "Reservado ou indisponível",
  selected: "Selecionado",
};

const seatStateMarkers: Record<SeatVisualState, ReactNode> = {
  available: "",
  purchased: <User size={12} strokeWidth={2.5} />,
  reserved: "R",
  selected: "",
};

const ACCESSIBLE_SEAT_COUNT = 6;
const ACCESSIBLE_SEATS_PER_SIDE = 3;

export function SeatMap({ sessionId }: SeatMapProps) {
  const { locale, t } = useI18n();
  const [state, setState] = useState<SeatMapLoadState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  const trimmedSessionId = sessionId.trim();

  useEffect(() => {
    let isActive = true;

    if (!trimmedSessionId) {
      setState({ errorMessage: t("seats.invalidSession"), status: "error" });
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
            maxCenterSeatsPerRow: session.room.max_center_seats_per_row ?? null,
            accessibleRowIndex: session.room.accessible_row_index ?? null,
            status: "success",
          });
        }
      } catch (error) {
        if (isActive) {
          setState({
            errorMessage: getApiErrorUserMessage(error, locale),
            status: "error",
          });
        }
      }
    }

    void fetchSeatMap();

    return () => {
      isActive = false;
    };
  }, [trimmedSessionId, retryCount, locale, t]);

  const handleRetry = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  if (state.status === "loading") {
    return (
      <StateMessage tone="loading" title={t("seats.loadTitle")}>
        {t("seats.loadDescription")}
      </StateMessage>
    );
  }

  if (state.status === "error") {
    return (
      <StateMessage
        action={
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-error/45 bg-transparent px-3.5 text-sm font-extrabold leading-none text-text transition hover:bg-error/15"
            onClick={handleRetry}
            type="button"
          >
            {t("common.tryAgain")}
          </button>
        }
        title={t("seats.unavailableTitle")}
        tone="error"
      >
        {state.errorMessage ?? t("seats.unavailableDescription")}
      </StateMessage>
    );
  }

  return (
    <SeatMapView
      accessibleRowIndex={state.accessibleRowIndex}
      maxCenterSeatsPerRow={state.maxCenterSeatsPerRow}
      seats={state.seats}
      sessionBasePrice={state.sessionBasePrice}
      sessionId={sessionId.trim()}
    />
  );
}

export function SeatMapView({
  accessibleRowIndex,
  maxCenterSeatsPerRow,
  seats,
  sessionBasePrice,
  sessionId,
}: SeatMapViewProps) {
  const { locale, t } = useI18n();
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

  // Maps companion seat_id → its paired accessible SessionSeatMapItem.
  // Used to auto-select the accessible seat when a companion is clicked.
  const companionSeatIdToAccessible = useMemo(() => {
    const map = new Map<string, SessionSeatMapItem>();
    for (const s of currentSeats) {
      if (s.is_accessible && s.companion_seat_id) {
        map.set(s.companion_seat_id, s);
      }
    }
    return map;
  }, [currentSeats]);

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

    // If this is a companion seat, auto-select its paired accessible seat too.
    const pairedAccessible = companionSeatIdToAccessible.get(seat.seat_id);
    if (pairedAccessible) {
      const accessibleState = getSeatVisualState(pairedAccessible, selectedSeatIds);
      if (accessibleState === "available") {
        guardAction(() => {
          void reserveSeats([pairedAccessible, seat]);
        });
        return;
      }
    }

    // If this is an accessible seat with a companion, auto-select companion too.
    if (seat.is_accessible && seat.companion_seat_id) {
      const companion = currentSeats.find(
        (s) => s.seat_id === seat.companion_seat_id
      );
      const companionState = companion
        ? getSeatVisualState(companion, selectedSeatIds)
        : null;
      if (companion && companionState === "available") {
        guardAction(() => {
          void reserveSeats([seat, companion]);
        });
        return;
      }
    }

    guardAction(() => {
      void reserveSeat(seat);
    });
  }

  async function reserveSeat(seat: SessionSeatMapItem) {
    await reserveSeats([seat]);
  }

  async function reserveSeats(seatsToReserve: SessionSeatMapItem[]) {
    setErrorMessage(null);

    for (const seat of seatsToReserve) {
      setPendingSeatIds((current) => addToSet(current, seat.session_seat_id));
    }
    setCurrentSeats((current) =>
      markSeatsAsReservedBySeatIds(
        current,
        seatsToReserve.map((s) => s.seat_id)
      )
    );

    try {
      const response = await reservationApi.reserveSeats(
        sessionId,
        seatsToReserve.map((s) => s.seat_id)
      );
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
        restoreSeatSnapshots(current, seatsToReserve)
      );
      setErrorMessage(getSeatInteractionErrorMessage(error, locale, t));
    } finally {
      for (const seat of seatsToReserve) {
        setPendingSeatIds((current) =>
          removeFromSet(current, seat.session_seat_id)
        );
      }
    }
  }

  async function releaseSeat(seat: SessionSeatMapItem) {
    const seatsToRelease = [seat];

    // When releasing an accessible seat, also release its companion if selected.
    if (seat.is_accessible && seat.companion_seat_id) {
      const companion = currentSeats.find(
        (s) => s.seat_id === seat.companion_seat_id
      );
      if (companion && selectedSeatIds.has(companion.session_seat_id)) {
        seatsToRelease.push(companion);
      }
    }

    const reservedSeats = seatsToRelease
      .map((s) =>
        reservedSeatsForSession.find(
          (r) => r.sessionSeatId === s.session_seat_id
        )
      )
      .filter((r): r is NonNullable<typeof r> => r !== undefined);

    setErrorMessage(null);
    for (const s of seatsToRelease) {
      setPendingSeatIds((current) => addToSet(current, s.session_seat_id));
      reservation.removeSeat(s.session_seat_id);
    }
    setCurrentSeats((current) =>
      markSeatsAsAvailableBySessionSeatIds(
        current,
        seatsToRelease.map((s) => s.session_seat_id)
      )
    );

    try {
      const response = await reservationApi.releaseReservations(
        sessionId,
        seatsToRelease.map((s) => s.session_seat_id)
      );
      const releasedSessionSeatIds = response.seats.map(
        (responseSeat) => responseSeat.session_seat_id
      );

      setCurrentSeats((current) =>
        markSeatsAsAvailableBySessionSeatIds(current, releasedSessionSeatIds)
      );
    } catch (error) {
      setCurrentSeats((current) =>
        restoreSeatSnapshots(current, seatsToRelease)
      );

      if (reservedSeats.length > 0) {
        reservation.addSeats(reservedSeats, { sessionId });
      }

      setErrorMessage(getSeatInteractionErrorMessage(error, locale, t));
    } finally {
      for (const s of seatsToRelease) {
        setPendingSeatIds((current) =>
          removeFromSet(current, s.session_seat_id)
        );
      }
    }
  }

  return (
    <SeatMapLayout
      accessibleRowIndex={accessibleRowIndex}
      errorMessage={errorMessage}
      maxCenterSeatsPerRow={maxCenterSeatsPerRow}
      onSeatToggle={toggleSeat}
      pendingSeatIds={pendingSeatIds}
      seats={currentSeats}
      selectedSeatIds={selectedSeatIds}
    />
  );
}

const ZOOM_FACTOR = 1.15;
const MAX_ZOOM_STEPS = 8;
const DEFAULT_TARGET_ZOOM = 0.67;

export function SeatMapLayout({
  accessibleRowIndex,
  errorMessage,
  maxCenterSeatsPerRow,
  onSeatToggle,
  pendingSeatIds = new Set(),
  seats,
  selectedSeatIds = new Set(),
}: SeatMapLayoutProps) {
  const { t } = useI18n();
  const layout = useMemo(
    () => buildSeatMapLayout(seats, maxCenterSeatsPerRow ?? null, accessibleRowIndex ?? null),
    [seats, maxCenterSeatsPerRow, accessibleRowIndex]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const naturalWidthRef = useRef(0);
  const prevEffectiveZoomRef = useRef(1);
  const hasInitializedZoomRef = useRef(false);
  const isMouseDownRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const [fitZoom, setFitZoom] = useState(1);
  const [zoomOffset, setZoomOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const effectiveZoom = fitZoom * Math.pow(ZOOM_FACTOR, zoomOffset);
  const canZoomIn = zoomOffset < MAX_ZOOM_STEPS;
  const canZoomOut = zoomOffset > -MAX_ZOOM_STEPS;

  useLayoutEffect(() => {
    const map = mapRef.current;
    const scroll = scrollRef.current;
    if (!map || !scroll) return;

    const prevZoom = map.style.zoom;
    map.style.zoom = "1";
    const naturalWidth = map.offsetWidth;
    map.style.zoom = prevZoom;
    naturalWidthRef.current = naturalWidth;

    if (naturalWidth > 0) {
      const cs = window.getComputedStyle(scroll);
      const padding = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const available = scroll.clientWidth - padding;
      const newFitZoom = Math.min(1, available / naturalWidth);
      const rawOffset =
        Math.log(DEFAULT_TARGET_ZOOM / newFitZoom) / Math.log(ZOOM_FACTOR);
      // Zooming in rounds to the nearest step; zooming out floors so the map
      // opens at or below the target zoom instead of staying at a larger fit.
      const steppedOffset =
        rawOffset >= 0 ? Math.round(rawOffset) : Math.floor(rawOffset);
      const defaultOffset = Math.min(Math.max(steppedOffset, -MAX_ZOOM_STEPS), MAX_ZOOM_STEPS);
      hasInitializedZoomRef.current = false;
      setFitZoom(newFitZoom);
      setZoomOffset(defaultOffset);
    }
  }, [seats.length]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const ro = new ResizeObserver(() => {
      const naturalWidth = naturalWidthRef.current;
      if (naturalWidth > 0) {
        const cs = window.getComputedStyle(scroll);
        const padding = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const available = scroll.clientWidth - padding;
        setFitZoom(Math.min(1, available / naturalWidth));
      }
    });
    ro.observe(scroll);
    return () => ro.disconnect();
  }, []);

  // Center viewport on user-initiated zoom (skip on first initialization)
  useEffect(() => {
    if (!hasInitializedZoomRef.current) {
      hasInitializedZoomRef.current = true;
      prevEffectiveZoomRef.current = effectiveZoom;
      return;
    }
    const scroll = scrollRef.current;
    if (!scroll) return;
    const prev = prevEffectiveZoomRef.current;
    const ratio = effectiveZoom / prev;
    scroll.scrollLeft = Math.max(
      0,
      (scroll.scrollLeft + scroll.clientWidth / 2) * ratio - scroll.clientWidth / 2
    );
    scroll.scrollTop = Math.max(
      0,
      (scroll.scrollTop + scroll.clientHeight / 2) * ratio - scroll.clientHeight / 2
    );
    prevEffectiveZoomRef.current = effectiveZoom;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomOffset]);

  // Keep prevEffectiveZoomRef in sync for resize-induced zoom changes
  useEffect(() => {
    prevEffectiveZoomRef.current = effectiveZoom;
  });

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isMouseDownRef.current = true;
    const scroll = scrollRef.current;
    if (!scroll) return;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isMouseDownRef.current) return;
      const scroll = scrollRef.current;
      if (!scroll) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) setIsDragging(true);
      scroll.scrollLeft = dragStartRef.current.scrollLeft - dx;
      scroll.scrollTop = dragStartRef.current.scrollTop - dy;
    },
    [isDragging]
  );

  const stopDragging = useCallback(() => {
    isMouseDownRef.current = false;
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const scroll = scrollRef.current;
    if (!scroll) return;
    isMouseDownRef.current = true;
    dragStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
    };
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isMouseDownRef.current || e.touches.length !== 1) return;
      const scroll = scrollRef.current;
      if (!scroll) return;
      const touch = e.touches[0];
      scroll.scrollLeft = dragStartRef.current.scrollLeft - (touch.clientX - dragStartRef.current.x);
      scroll.scrollTop = dragStartRef.current.scrollTop - (touch.clientY - dragStartRef.current.y);
    },
    []
  );

  if (seats.length === 0) {
    return (
      <StateMessage title={t("seats.emptyTitle")}>
        {t("seats.emptyDescription")}
      </StateMessage>
    );
  }

  return (
    <section aria-labelledby="mapa-assentos" className="seat-map-section min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="seat-map-section__header">
          <h2 id="mapa-assentos">{t("seats.title")}</h2>
          <p className="sr-only" id="mapa-assentos-instrucoes">
            {t("seats.instructions")}
          </p>
        </div>
        <div
          aria-label={t("seats.zoomControls")}
          className="flex shrink-0 items-center gap-1"
          role="group"
        >
          <button
            aria-label={t("seats.zoomOut")}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-white/5 text-text/60 transition hover:bg-white/10 hover:text-text disabled:pointer-events-none disabled:opacity-30"
            disabled={!canZoomOut}
            onClick={() => setZoomOffset((o) => Math.max(o - 1, -MAX_ZOOM_STEPS))}
            type="button"
          >
            <ZoomOut size={14} />
          </button>
          <span
            aria-hidden="true"
            className="w-10 text-center text-xs font-bold tabular-nums text-text/50"
          >
            {Math.round(effectiveZoom * 100)}%
          </span>
          <button
            aria-label={t("seats.zoomIn")}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-white/5 text-text/60 transition hover:bg-white/10 hover:text-text disabled:pointer-events-none disabled:opacity-30"
            disabled={!canZoomIn}
            onClick={() => setZoomOffset((o) => Math.min(o + 1, MAX_ZOOM_STEPS))}
            type="button"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <SeatMapLegend />

      {errorMessage ? (
        <p className="inline-status inline-status-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div
        aria-describedby="mapa-assentos-instrucoes"
        aria-label={t("seats.mapContainerA11y")}
        className={[
          "seat-map-scroll min-w-0 [&::-webkit-scrollbar]:hidden",
          isDragging ? "cursor-grabbing select-none" : "cursor-grab",
        ].join(" ")}
        onMouseDown={handleMouseDown}
        onMouseLeave={stopDragging}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onTouchEnd={stopDragging}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        ref={scrollRef}
        style={{ overflow: "scroll", scrollbarWidth: "none" }}
        tabIndex={0}
      >
        <div
          aria-label={t("seats.interactiveMapA11y")}
          className="seat-map"
          ref={mapRef}
          style={{ zoom: effectiveZoom }}
        >
          <div className="seat-map__screen">{t("seats.screen")}</div>

          <div className="seat-map__rows">
            {layout.rows.slice(0, layout.accessibleRowIndex).map((row, index) =>
              renderRegularRow({ globalIndex: index, onSeatToggle, pendingSeatIds, row, selectedSeatIds, t, totalRows: layout.rows.length })
            )}

            <div
              aria-label={t("seats.accessiblePriorityA11y")}
              className="seat-map__accessible-row"
              role="group"
            >
              <span aria-hidden="true" className="seat-map__row-label">
                {layout.accessibleRowLabel}
              </span>
              <div className="seat-map__accessible-list">
                <div className="seat-map__accessible-group seat-map__accessible-group--left">
                  {layout.accessibleLeftPairs.map((pair) =>
                    renderAccessiblePair({
                      companionFirst: true,
                      onSeatToggle,
                      pair,
                      pendingSeatIds,
                      selectedSeatIds,
                      t,
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
                      t,
                    })
                  )}
                </div>
              </div>
              <span aria-hidden="true" className="seat-map__row-label">
                {layout.accessibleRowLabel}
              </span>
            </div>

            {layout.rows.slice(layout.accessibleRowIndex).map((row, index) =>
              renderRegularRow({ globalIndex: layout.accessibleRowIndex + index, onSeatToggle, pendingSeatIds, row, selectedSeatIds, t, totalRows: layout.rows.length })
            )}
          </div>

          <div className="seat-map__back-label">{t("seats.backOfRoom")}</div>
        </div>
      </div>
    </section>
  );
}

function renderRegularRow({
  globalIndex,
  onSeatToggle,
  pendingSeatIds,
  row,
  selectedSeatIds,
  t,
  totalRows,
}: {
  globalIndex: number;
  onSeatToggle?: (seat: SessionSeatMapItem) => void;
  pendingSeatIds: ReadonlySet<string>;
  row: SeatMapRenderedRow;
  selectedSeatIds: ReadonlySet<string>;
  t: Translate;
  totalRows: number;
}) {
  const isLastRow = globalIndex === totalRows - 1;
  const hasNamoradeiras =
    row.leftNamoradeiras.length > 0 || row.rightNamoradeiras.length > 0;

  return (
    <div
      className="seat-map__row"
      key={row.rowLabel}
    >
      <span
        aria-hidden="true"
        className="seat-map__row-label"
      >
        {row.rowLabel}
      </span>
      <div
        aria-label={t("seats.rowA11y", { row: row.rowLabel })}
        className={[
          "seat-map__seat-list",
          // Back row: wider central gap where the projector cabin sits.
          isLastRow
            ? "[grid-template-columns:minmax(0,1fr)_64px_minmax(0,1fr)]"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="group"
      >
        <div className="seat-map__seat-group seat-map__seat-group--left">
          {hasNamoradeiras && row.leftNamoradeiras.map((seat) =>
            renderSeatButton({
              displayNumber: seat.displayNumber,
              key: seat.seat.session_seat_id,
              onSeatToggle,
              pendingSeatIds,
              seat: seat.seat,
              selectedSeatIds,
              t,
            })
          )}
          {hasNamoradeiras && (
            <span aria-hidden="true" className="block w-5 flex-shrink-0" />
          )}
          {row.leftSeats.map((seat) =>
            renderSeatButton({
              displayNumber: seat.displayNumber,
              key: seat.seat.session_seat_id,
              onSeatToggle,
              pendingSeatIds,
              seat: seat.seat,
              selectedSeatIds,
              t,
            })
          )}
        </div>
        <span
          aria-hidden="true"
          className={[
            "seat-map__center-aisle",
            isLastRow ? "!w-16" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <div className="seat-map__seat-group seat-map__seat-group--right">
          {row.rightSeats.map((seat) =>
            renderSeatButton({
              displayNumber: seat.displayNumber,
              key: seat.seat.session_seat_id,
              onSeatToggle,
              pendingSeatIds,
              seat: seat.seat,
              selectedSeatIds,
              t,
            })
          )}
          {hasNamoradeiras && (
            <span aria-hidden="true" className="block w-5 flex-shrink-0" />
          )}
          {hasNamoradeiras && row.rightNamoradeiras.map((seat) =>
            renderSeatButton({
              displayNumber: seat.displayNumber,
              key: seat.seat.session_seat_id,
              onSeatToggle,
              pendingSeatIds,
              seat: seat.seat,
              selectedSeatIds,
              t,
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
  );
}

function renderAccessiblePair({
  companionFirst = false,
  onSeatToggle,
  pair,
  pendingSeatIds,
  selectedSeatIds,
  t,
}: {
  companionFirst?: boolean;
  onSeatToggle?: (seat: SessionSeatMapItem) => void;
  pair: SeatMapAccessiblePair;
  pendingSeatIds: ReadonlySet<string>;
  selectedSeatIds: ReadonlySet<string>;
  t: Translate;
}) {
  const accessibleSeatButton = renderSeatButton({
    displayNumber: pair.accessibleSeat.displayNumber,
    key: `${pair.accessibleSeat.seat.session_seat_id}-accessible`,
    onSeatToggle,
    pendingSeatIds,
    seat: pair.accessibleSeat.seat,
    selectedSeatIds,
    t,
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
        t,
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
  t,
}: {
  displayLabel?: string;
  displayNumber?: number;
  isCompanion?: boolean;
  key: string;
  onSeatToggle?: (seat: SessionSeatMapItem) => void;
  pendingSeatIds: ReadonlySet<string>;
  seat: SessionSeatMapItem;
  selectedSeatIds: ReadonlySet<string>;
  t: Translate;
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
          ? getCompanionSeatAccessibleLabel(seat, visualState, {
              displayLabel,
              displayNumber,
              t,
            })
          : getSeatAccessibleLabel(seat, visualState, {
              displayLabel,
              displayNumber,
              t,
            })
      }
      aria-pressed={isSelected}
      className={[
        "seat-map__seat",
        `seat-map__seat--${visualState}`,
        seat.is_accessible && !isCompanion ? "seat-map__seat--accessible" : "",
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
      {visualState !== "purchased" && (
        <span className="seat-map__seat-number">
          {displayLabel ?? displayNumber ?? seat.number}
        </span>
      )}
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
  const { t } = useI18n();
  const legendItems: Array<{
    className: string;
    label: string;
    marker: ReactNode;
  }> = [
    {
      className: "seat-map__legend-swatch--available",
      label: t("seats.status.available"),
      marker: seatStateMarkers.available,
    },
    {
      className: "seat-map__legend-swatch--selected",
      label: t("seats.status.selected"),
      marker: seatStateMarkers.selected,
    },
    {
      className: "seat-map__legend-swatch--reserved",
      label: t("seats.status.reserved"),
      marker: seatStateMarkers.reserved,
    },
    {
      className: "seat-map__legend-swatch--purchased",
      label: t("seats.status.purchased"),
      marker: seatStateMarkers.purchased,
    },
    {
      className: "seat-map__legend-swatch--accessible",
      label: t("seats.accessible"),
      marker: "♿",
    },
    {
      className: "seat-map__legend-swatch--companion",
      label: t("seats.companion"),
      marker: "AC",
    },
  ];

  return (
    <ul aria-label={t("seats.legend")} className="seat-map__legend">
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
  seats: SessionSeatMapItem[],
  maxCenterSeatsPerRow: number | null = null,
  accessibleRowIndex: number | null = null
): SeatMapLayoutModel {
  const accessibleSeats = getAccessibleDisplaySeats(seats);
  const accessibleSeatIds = new Set(
    accessibleSeats.map((seat) => seat.session_seat_id)
  );
  const accessiblePairs = pairAccessibleSeatsWithCompanions(
    withDisplayNumbers(accessibleSeats),
    seats,
    accessibleSeatIds
  );
  const companionSeatIds = accessiblePairs
    .map((pair) => pair.companionSeat?.seat.session_seat_id)
    .filter((seatId): seatId is string => Boolean(seatId));
  const reservedFrontSeatIds = new Set([
    ...accessibleSeats.map((seat) => seat.session_seat_id),
    ...companionSeatIds,
  ]);
  // Seats of the dedicated accessible row never render as a regular row, even
  // if pairing left some of them unused — they'd show up as a phantom row.
  const roomRows = groupSeatMapRows(
    seats.filter(
      (seat) =>
        !reservedFrontSeatIds.has(seat.session_seat_id) && !seat.is_accessible_row
    )
  );
  // Prefer the row flagged as the accessible row (e.g. "PCD") over whatever
  // happens to be first after sorting — fallback seats from other rows can
  // otherwise sort before the real accessible row alphabetically.
  const accessibleRowLabel =
    seats.find((s) => s.is_accessible_row)?.row ??
    seats.find((s) => s.is_accessible)?.row ??
    null;

  // Clamp accessibleRowIndex to valid insertion points in regular rows.
  // Default to 0 (beginning) for rooms without the field configured.
  const resolvedAccessibleRowIndex =
    accessibleRowIndex !== null
      ? Math.min(Math.max(0, accessibleRowIndex), roomRows.length)
      : 0;

  const pairsPerSide = Math.max(
    ACCESSIBLE_SEATS_PER_SIDE,
    Math.ceil(accessiblePairs.length / 2)
  );

  return {
    accessibleLeftPairs: accessiblePairs.slice(0, pairsPerSide),
    accessibleRightPairs: accessiblePairs.slice(pairsPerSide),
    accessibleRowIndex: resolvedAccessibleRowIndex,
    accessibleRowLabel,
    maxCenterSeatsPerRow,
    rows: roomRows.map((row, rowIndex) => {
      const displaySeats = withDisplayNumbers(row.seats);
      // The back row has no namoradeiras: seats stay joined with only the
      // wider projector-cabin gap in the middle.
      const isLastRow = rowIndex === roomRows.length - 1;

      if (
        !isLastRow &&
        maxCenterSeatsPerRow !== null &&
        displaySeats.length > maxCenterSeatsPerRow
      ) {
        return { ...row, ...splitRowSeatsWithNamoradeiras(displaySeats, maxCenterSeatsPerRow) };
      }

      const { leftSeats, rightSeats } = splitRowSeats(displaySeats);
      return { ...row, leftSeats, rightSeats, leftNamoradeiras: [], rightNamoradeiras: [] };
    }),
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
  visualState: SeatVisualState,
  options: SeatAccessibleLabelOptions = {}
) {
  const displaySeat = getAccessibleLabelDisplaySeat(seat, options);
  const accessibleSuffix = seat.is_accessible
    ? options.t
      ? options.t("seats.accessibleSuffix")
      : ", assento acessível"
    : "";
  const stateLabel = getSeatStateLabel(visualState, options.t);

  if (options.t) {
    return options.t("seats.seatLabel", {
      accessibleSuffix,
      identifier: displaySeat.identifier,
      number: displaySeat.number,
      originalSuffix: displaySeat.originalSuffix,
      row: seat.row,
      state: stateLabel,
    });
  }

  return `Assento ${displaySeat.identifier}, fileira ${seat.row}, número ${displaySeat.number}${displaySeat.originalSuffix}, ${stateLabel}${accessibleSuffix}.`;
}

export function getCompanionSeatAccessibleLabel(
  seat: SessionSeatMapItem,
  visualState: SeatVisualState,
  options: SeatAccessibleLabelOptions = {}
) {
  const displaySeat = getAccessibleLabelDisplaySeat(seat, options);
  const stateLabel = getSeatStateLabel(visualState, options.t);

  if (options.t) {
    return options.t("seats.companionLabel", {
      identifier: displaySeat.identifier,
      number: displaySeat.number,
      originalSuffix: displaySeat.originalSuffix,
      row: seat.row,
      state: stateLabel,
    });
  }

  return `Assento acompanhante ${displaySeat.identifier}, fileira ${seat.row}, número ${displaySeat.number}${displaySeat.originalSuffix}, ${stateLabel}.`;
}

function getAccessibleLabelDisplaySeat(
  seat: SessionSeatMapItem,
  { displayLabel, displayNumber, t }: SeatAccessibleLabelOptions
) {
  const displayValue = displayLabel ?? displayNumber ?? seat.number;
  const displayNumberText = String(displayValue);
  const isOverridden = displayNumberText !== String(seat.number);

  return {
    identifier: displayLabel ?? `${seat.row}${displayNumberText}`,
    number: displayNumberText,
    originalSuffix: isOverridden
      ? t
        ? t("seats.originalSuffix", { seat: `${seat.row}${seat.number}` })
        : `, assento original ${seat.row}${seat.number}`
      : "",
  };
}

function getSeatStateLabel(visualState: SeatVisualState, t?: Translate): string {
  return t
    ? t(`seats.status.${visualState}`)
    : defaultSeatStateLabels[visualState];
}

export function buildReservedSeatsFromReservation(
  response: TemporaryReservationResponse,
  seatMap: SessionSeatMapItem[],
  basePrice: number,
  expiresAtValue = response.expires_at
): ReservedSeat[] {
  const expiresAt = new Date(expiresAtValue);
  const seatsBySeatId = new Map(seatMap.map((seat) => [seat.seat_id, seat]));
  const companionSeatIds = new Set(
    seatMap
      .filter((s) => s.is_accessible && s.companion_seat_id)
      .map((s) => s.companion_seat_id!)
  );

  return response.seats.map((reservedSeat) => {
    const originalSeat = seatsBySeatId.get(reservedSeat.seat_id);

    if (!originalSeat) {
      throw new Error("Reserved seat was not present in the loaded seat map.");
    }

    return {
      basePrice,
      expiresAt,
      isAccessible: originalSeat.is_accessible,
      isCompanion: companionSeatIds.has(reservedSeat.seat_id),
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

export function getSeatInteractionErrorMessage(
  error: unknown,
  locale?: string,
  t?: Translate
) {
  if (error instanceof ApiError && error.code === "SEAT_ALREADY_RESERVED") {
    return t
      ? t("seats.alreadyReserved")
      : "Esse assento acabou de ser reservado por outra pessoa. Escolha outro lugar.";
  }

  return getApiErrorUserMessage(error, locale);
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

  // With a dedicated accessible row, every accessible seat belongs to the
  // accessible strip — capping at ACCESSIBLE_SEAT_COUNT would spill the rest
  // into a phantom regular row.
  const hasAccessibleRow = seats.some((s) => s.is_accessible_row);

  for (const seat of seats
    .filter((seat) => seat.is_accessible)
    .sort(compareSeatPositions)) {
    if (!hasAccessibleRow && selectedSeats.length >= ACCESSIBLE_SEAT_COUNT) {
      break;
    }

    selectedSeatIds.add(seat.session_seat_id);
    selectedSeats.push(seat);
  }

  // Fallbacks from regular rows are only needed when there's no dedicated accessible row.
  if (!hasAccessibleRow) {
    for (const seat of getAccessibleFallbackSeats(seats, selectedSeatIds)) {
      if (selectedSeats.length >= ACCESSIBLE_SEAT_COUNT) {
        break;
      }

      selectedSeatIds.add(seat.session_seat_id);
      selectedSeats.push(seat);
    }
  }

  return selectedSeats
    .sort(compareSeatPositions)
    .map((seat) => ({ ...seat, is_accessible: true }));
}

function pairAccessibleSeatsWithCompanions(
  accessibleSeats: SeatMapDisplaySeat[],
  seats: SessionSeatMapItem[],
  selectedSeatIds: ReadonlySet<string>
): SeatMapAccessiblePair[] {
  const usedSeatIds = new Set(selectedSeatIds);
  const seatBySeatId = new Map(seats.map((s) => [s.seat_id, s]));

  return accessibleSeats.map((accessibleSeat) => {
    let companionSeat: SessionSeatMapItem | undefined;

    const explicitCompanionId = accessibleSeat.seat.companion_seat_id;
    if (explicitCompanionId) {
      const candidate = seatBySeatId.get(explicitCompanionId);
      // Companion must be in the same row; if not, the FK is stale/wrong — fall through to adjacent lookup.
      if (candidate && !usedSeatIds.has(candidate.session_seat_id) && candidate.row === accessibleSeat.seat.row) {
        companionSeat = candidate;
      } else {
        companionSeat =
          findAdjacentCompanionSeat(accessibleSeat.seat, seats, usedSeatIds) ??
          findFallbackCompanionSeat(accessibleSeat.seat, seats, usedSeatIds);
      }
    } else {
      companionSeat =
        findAdjacentCompanionSeat(accessibleSeat.seat, seats, usedSeatIds) ??
        findFallbackCompanionSeat(accessibleSeat.seat, seats, usedSeatIds);
    }

    if (companionSeat) {
      usedSeatIds.add(companionSeat.session_seat_id);
    }

    return {
      accessibleSeat,
      companionSeat: companionSeat
        ? {
            displayNumber: companionSeat.number,
            seat: companionSeat,
          }
        : undefined,
    };
  });
}

function findAdjacentCompanionSeat(
  accessibleSeat: SessionSeatMapItem,
  seats: SessionSeatMapItem[],
  usedSeatIds: ReadonlySet<string>
) {
  return seats
    .filter(
      (seat) =>
        isCompanionCandidate(seat, usedSeatIds) &&
        seat.row === accessibleSeat.row &&
        Math.abs(seat.number - accessibleSeat.number) === 1
    )
    .sort(compareSeatPositions)[0];
}

function findFallbackCompanionSeat(
  accessibleSeat: SessionSeatMapItem,
  seats: SessionSeatMapItem[],
  usedSeatIds: ReadonlySet<string>
) {
  const sameRowSeat = seats
    .filter(
      (seat) =>
        isCompanionCandidate(seat, usedSeatIds) &&
        seat.row === accessibleSeat.row
    )
    .sort((leftSeat, rightSeat) => {
      const distanceComparison =
        Math.abs(leftSeat.number - accessibleSeat.number) -
        Math.abs(rightSeat.number - accessibleSeat.number);

      if (distanceComparison !== 0) {
        return distanceComparison;
      }

      return compareSeatPositions(leftSeat, rightSeat);
    })[0];

  if (sameRowSeat) {
    return sameRowSeat;
  }

  return getAccessibleFallbackSeats(seats, usedSeatIds).find((seat) =>
    isCompanionCandidate(seat, usedSeatIds)
  );
}

function isCompanionCandidate(
  seat: SessionSeatMapItem,
  usedSeatIds: ReadonlySet<string>
) {
  return !seat.is_accessible && !usedSeatIds.has(seat.session_seat_id);
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

function splitRowSeatsWithNamoradeiras(
  seats: SeatMapDisplaySeat[],
  maxCenter: number
) {
  const excess = seats.length - maxCenter;
  const leftExcess = Math.ceil(excess / 2);

  const leftNamoradeiras = seats.slice(0, leftExcess);
  const centerSeats = seats.slice(leftExcess, leftExcess + maxCenter);
  const rightNamoradeiras = seats.slice(leftExcess + maxCenter);

  const { leftSeats, rightSeats } = splitRowSeats(centerSeats);

  return { leftNamoradeiras, leftSeats, rightNamoradeiras, rightSeats };
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
