import type { Page, Route } from "@playwright/test";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:40123";

export const fixedNow = new Date("2026-05-24T12:00:00-03:00");

const posterDataUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='480' viewBox='0 0 320 480'%3E%3Crect width='320' height='480' fill='%2314141f'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ffffff' font-family='Arial' font-size='28'%3ECinePrime%3C/text%3E%3C/svg%3E";

type SessionSeat = {
  is_accessible: boolean;
  lock_expires_at: string | null;
  number: number;
  reserved_by_current_user?: boolean;
  row: string;
  seat_id: string;
  session_seat_id: string;
  status: "AVAILABLE" | "RESERVED" | "PURCHASED";
};

type MockOptions = {
  failNextReservation?: boolean;
  reservationExpiresAt?: string;
};

export function createMockApiState(options: MockOptions = {}) {
  let failNextReservation = options.failNextReservation ?? false;
  const reservationExpiresAt =
    options.reservationExpiresAt ??
    new Date(fixedNow.getTime() + 10 * 60 * 1000).toISOString();
  const checkoutPayloads: unknown[] = [];
  const reservations: string[] = [];
  const seats: SessionSeat[] = [
    {
      is_accessible: false,
      lock_expires_at: null,
      number: 1,
      row: "A",
      seat_id: "seat-a1",
      session_seat_id: "session-seat-a1",
      status: "AVAILABLE",
    },
    {
      is_accessible: false,
      lock_expires_at: null,
      number: 2,
      row: "A",
      seat_id: "seat-a2",
      session_seat_id: "session-seat-a2",
      status: "AVAILABLE",
    },
    {
      is_accessible: false,
      lock_expires_at: null,
      number: 3,
      row: "A",
      seat_id: "seat-a3",
      session_seat_id: "session-seat-a3",
      status: "RESERVED",
    },
    {
      is_accessible: true,
      lock_expires_at: null,
      number: 4,
      row: "A",
      seat_id: "seat-a4",
      session_seat_id: "session-seat-a4",
      status: "AVAILABLE",
    },
  ];

  return {
    checkoutPayloads,
    handleRoute: (route: Route) =>
      handleApiRoute(route, {
        checkoutPayloads,
        failNextReservation: () => failNextReservation,
        markReservationFailureConsumed: () => {
          failNextReservation = false;
        },
        reservationExpiresAt,
        reservations,
        seats,
      }),
    reservations,
    seats,
  };
}

export async function setupMockApi(page: Page, options: MockOptions = {}) {
  const state = createMockApiState(options);

  await page.route(`${apiBaseUrl}/api/v1/**`, state.handleRoute);

  return state;
}

type ApiRouteState = {
  checkoutPayloads: unknown[];
  failNextReservation: () => boolean;
  markReservationFailureConsumed: () => void;
  reservationExpiresAt: string;
  reservations: string[];
  seats: SessionSeat[];
};

async function handleApiRoute(route: Route, state: ApiRouteState) {
  const request = route.request();
  const url = new URL(request.url());
  const path = `${url.pathname}${url.search}`;
  const method = request.method();

  if (method === "POST" && url.pathname === "/api/v1/auth/register/") {
    return json(route, {
      created_at: fixedNow.toISOString(),
      email: "ana@example.com",
      id: "user-1",
      username: "ana",
    });
  }

  if (method === "POST" && url.pathname === "/api/v1/auth/login/") {
    return json(route, {
      access: "access-token-e2e",
      refresh: "refresh-token-e2e",
    });
  }

  if (method === "GET" && url.pathname === "/api/v1/users/me/") {
    return json(route, {
      created_at: fixedNow.toISOString(),
      email: "ana@example.com",
      id: "user-1",
      username: "ana",
    });
  }

  if (method === "GET" && url.pathname === "/api/v1/catalog/movies/") {
    if (url.searchParams.get("status") === "pre_venda") {
      return json(route, paginated([preSaleMovie]));
    }

    if (url.searchParams.get("status") === "em_breve") {
      return json(route, paginated([upcomingMovie]));
    }

    return json(route, paginated([movie]));
  }

  if (method === "GET" && url.pathname === `/api/v1/catalog/movies/${movie.id}/`) {
    return json(route, movie);
  }

  if (method === "GET" && url.pathname === "/api/v1/catalog/sessions/") {
    return json(route, paginated([session]));
  }

  if (method === "GET" && url.pathname === `/api/v1/catalog/sessions/${session.id}/`) {
    return json(route, session);
  }

  if (
    method === "GET" &&
    url.pathname === `/api/v1/reservation/sessions/${session.id}/seats/`
  ) {
    return json(route, state.seats);
  }

  if (
    method === "POST" &&
    url.pathname === `/api/v1/reservation/sessions/${session.id}/reservations/`
  ) {
    if (state.failNextReservation()) {
      state.markReservationFailureConsumed();
      return backendError(route, 409, "SEAT_ALREADY_RESERVED");
    }

    const payload = request.postDataJSON() as { seat_ids?: string[] };
    const requestedSeatIds = payload.seat_ids ?? [];
    const reservedSeats = state.seats.filter((seat) =>
      requestedSeatIds.includes(seat.seat_id)
    );

    for (const seat of reservedSeats) {
      seat.status = "RESERVED";
      seat.reserved_by_current_user = true;
      seat.lock_expires_at = state.reservationExpiresAt;
      state.reservations.push(seat.session_seat_id);
    }

    return json(route, {
      expires_at: state.reservationExpiresAt,
      seats: reservedSeats.map((seat) => ({
        number: seat.number,
        row: seat.row,
        seat_id: seat.seat_id,
        status: "RESERVED",
      })),
      session_id: session.id,
      status: "reserved",
    });
  }

  if (
    method === "DELETE" &&
    url.pathname === `/api/v1/reservation/sessions/${session.id}/reservations/`
  ) {
    const payload = request.postDataJSON() as { session_seat_ids?: string[] };
    const sessionSeatIds = payload.session_seat_ids ?? [];
    const releasedSeats = state.seats.filter((seat) =>
      sessionSeatIds.includes(seat.session_seat_id)
    );

    for (const seat of releasedSeats) {
      seat.status = "AVAILABLE";
      seat.reserved_by_current_user = false;
      seat.lock_expires_at = null;
    }

    return json(route, {
      seats: releasedSeats,
      session_id: session.id,
      status: "released",
    });
  }

  if (method === "POST" && url.pathname === "/api/v1/reservation/checkout/") {
    const payload = request.postDataJSON();
    state.checkoutPayloads.push(payload);

    return json(route, {
      payment_method: "pix",
      seats: [
        {
          amount_paid: "18.00",
          number: 1,
          row: "A",
          seat_id: "seat-a1",
          session_seat_id: "session-seat-a1",
          status: "PURCHASED",
          ticket_type: "meia",
        },
      ],
      status: "confirmed",
      tickets: [
        {
          amount_paid: "18.00",
          movie: {
            id: movie.id,
            title: movie.title,
          },
          payment_method: "pix",
          room: {
            id: session.room.id,
            name: session.room.name,
          },
          seat: {
            id: "seat-a1",
            identifier: "A1",
            number: 1,
            row: "A",
          },
          seat_id: "seat-a1",
          session: {
            end_time: session.end_time,
            id: session.id,
            start_time: session.start_time,
          },
          session_seat_id: "session-seat-a1",
          ticket_code: "CN-E2E-A1",
          ticket_id: "ticket-a1",
          ticket_type: "meia",
        },
      ],
      total_amount: "18.00",
    });
  }

  return backendError(route, 500, "INTERNAL_SERVER_ERROR", {
    details: { method, path },
    message: `Unhandled E2E API route: ${method} ${path}`,
  });
}

const movie = {
  duration_minutes: 128,
  genres: [{ id: "genre-adventure", name: "Aventura" }],
  id: "movie-natal",
  is_featured: true,
  poster_url: posterDataUrl,
  release_date: "2026-05-20",
  status: "em_cartaz",
  synopsis: "Uma aventura criada para validar o fluxo de compra em browser.",
  title: "A Jornada de Natal",
};

const preSaleMovie = {
  ...movie,
  id: "movie-presale",
  is_featured: false,
  status: "pre_venda",
  title: "Estreia da Semana",
};

const upcomingMovie = {
  ...movie,
  id: "movie-upcoming",
  is_featured: false,
  status: "em_breve",
  title: "Em Breve em Natal",
};

const session = {
  audio_format: "legendado",
  base_price: "36.00",
  end_time: "2026-05-24T17:10:00-03:00",
  id: "session-morning",
  movie,
  projection_format: "3d",
  room: {
    capacity: 4,
    description: "",
    display_name: "",
    experience_type: "vip",
    id: "room-1",
    name: "Sala 1",
  },
  session_type: "preview",
  start_time: "2026-05-24T15:00:00-03:00",
};

function paginated<T>(results: T[]) {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

function backendError(
  route: Route,
  status: number,
  code: string,
  options: { details?: unknown; message?: string } = {}
) {
  return json(
    route,
    {
      error: {
        code,
        details: options.details ?? {},
        message: options.message ?? code,
        status,
      },
    },
    status
  );
}
