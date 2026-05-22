"use client";

import { useEffect, useMemo, useState } from "react";

import { getApiErrorUserMessage } from "@/api/client";
import { reservationApi } from "@/api/reservation";
import { StateMessage } from "@/components/ui/StateMessage";
import type { SessionSeatMapItem } from "@/types/reservation";

type SeatMapLoadState =
  | { status: "error"; errorMessage?: string }
  | { status: "loading" }
  | { seats: SessionSeatMapItem[]; status: "success" };

export type SeatMapRow = {
  rowLabel: string;
  seats: SessionSeatMapItem[];
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
  seats: SessionSeatMapItem[];
};

const seatStateLabels: Record<SeatVisualState, string> = {
  available: "Disponível",
  purchased: "Comprado",
  reserved: "Reservado ou indisponível",
  selected: "Selecionado",
};

const seatStateMarkers: Record<SeatVisualState, string> = {
  available: "L",
  purchased: "C",
  reserved: "R",
  selected: "S",
};

export function SeatMap({ sessionId }: SeatMapProps) {
  const [state, setState] = useState<SeatMapLoadState>({ status: "loading" });

  useEffect(() => {
    let isActive = true;
    const trimmedSessionId = sessionId.trim();

    if (!trimmedSessionId) {
      setState({ errorMessage: "Sessão inválida.", status: "error" });
      return;
    }

    async function fetchSeatMap() {
      setState({ status: "loading" });

      try {
        const seats = await reservationApi.getSeatMap(trimmedSessionId);

        if (isActive) {
          setState({ seats, status: "success" });
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
  }, [sessionId]);

  if (state.status === "loading") {
    return (
      <StateMessage tone="loading" title="Carregando mapa de assentos">
        Buscando a disposição da sala para esta sessão.
      </StateMessage>
    );
  }

  if (state.status === "error") {
    return (
      <StateMessage title="Mapa indisponível" tone="error">
        {state.errorMessage ??
          "Não conseguimos carregar os assentos desta sessão agora."}
      </StateMessage>
    );
  }

  return <SeatMapView seats={state.seats} />;
}

export function SeatMapView({ seats }: SeatMapViewProps) {
  const rows = useMemo(() => groupSeatMapRows(seats), [seats]);
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(
    () => new Set()
  );

  function toggleSeat(seat: SessionSeatMapItem) {
    if (seat.status !== "AVAILABLE") {
      return;
    }

    setSelectedSeatIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      if (nextSelection.has(seat.session_seat_id)) {
        nextSelection.delete(seat.session_seat_id);
      } else {
        nextSelection.add(seat.session_seat_id);
      }

      return nextSelection;
    });
  }

  if (rows.length === 0) {
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
          Visitantes podem consultar a sala. A seleção abaixo é local e não
          reserva assentos.
        </p>
      </div>

      <SeatMapLegend />

      <div
        aria-label="Área rolável do mapa de assentos"
        className="seat-map-scroll"
        tabIndex={0}
      >
        <div
          aria-label="Mapa interativo de assentos da sessão"
          className="seat-map"
        >
          <div className="seat-map__screen">Tela</div>

          <div className="seat-map__rows">
            {rows.map((row) => (
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
                  {row.seats.map((seat, seatIndex) => {
                    const visualState = getSeatVisualState(
                      seat,
                      selectedSeatIds
                    );
                    const isSelected = visualState === "selected";
                    const isUnavailable =
                      visualState === "reserved" ||
                      visualState === "purchased";

                    return (
                      <button
                        aria-disabled={isUnavailable}
                        aria-label={getSeatAccessibleLabel(
                          seat,
                          visualState
                        )}
                        aria-pressed={isSelected}
                        className={[
                          "seat-map__seat",
                          `seat-map__seat--${visualState}`,
                          seat.is_accessible
                            ? "seat-map__seat--accessible"
                            : "",
                          shouldAddCenterAisle(row.seats, seatIndex)
                            ? "seat-map__seat--after-aisle"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        data-state={visualState}
                        key={seat.session_seat_id}
                        onClick={() => toggleSeat(seat)}
                        type="button"
                      >
                        <span className="seat-map__seat-number">
                          {seat.number}
                        </span>
                        <span
                          aria-hidden="true"
                          className="seat-map__seat-marker"
                        >
                          {seatStateMarkers[visualState]}
                        </span>
                        {seat.is_accessible ? (
                          <span
                            aria-hidden="true"
                            className="seat-map__seat-accessible"
                          >
                            ♿
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
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
  ];

  return (
    <div aria-label="Legenda dos assentos" className="seat-map__legend">
      {legendItems.map((item) => (
        <div className="seat-map__legend-item" key={item.label}>
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
        </div>
      ))}
    </div>
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
        return leftSeat.number - rightSeat.number;
      }),
    }));
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

function shouldAddCenterAisle(seats: SessionSeatMapItem[], seatIndex: number) {
  return seats.length > 4 && seatIndex === Math.ceil(seats.length / 2) - 1;
}

function compareRowLabels(leftRow: string, rightRow: string) {
  return leftRow.localeCompare(rightRow, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}
