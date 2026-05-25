import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { authApi } from "@/api/auth";
import { ApiError, getApiErrorUserMessage, setApiAuthController } from "@/api/client";
import { checkoutApi } from "@/api/checkout";
import { catalogApi } from "@/api/catalog";
import { reservationApi } from "@/api/reservation";
import {
  getGuardedActionDecision,
  getProtectedRouteDecision,
} from "@/components/auth/route-guards";
import { getSafeRedirectFromSearch } from "@/components/auth/auth-form-utils";
import { CheckoutConfirmationContent } from "@/components/reservations/CheckoutConfirmation";
import { buildCheckoutPayload, getCheckoutErrorMessage } from "@/components/reservations/checkout-flow";
import {
  getPurchaseFlowGuardDecision,
  PURCHASE_FLOW_EXPIRED_MESSAGE,
} from "@/components/reservations/purchase-flow-guards";
import { TicketTypeSelectionForm } from "@/components/reservations/TicketTypeSelection";
import {
  buildReservedSeatsFromReservation,
  getSeatInteractionErrorMessage,
  getSeatVisualState,
  markSeatsAsAvailableBySessionSeatIds,
  markSeatsAsReservedBySeatIds,
  restoreSeatSnapshots,
  SeatMapLayout,
} from "@/components/seats/SeatMap";
import { MovieDetailView } from "@/components/movies/MovieDetail";
import { HomeCatalogSections } from "@/app/HomeCatalog";
import {
  addSeatsToReservation,
  expireReservation,
  initialReservationState,
  setReservationPaymentMethod,
  setReservationTicketType,
  storeCheckoutResult,
} from "@/contexts/reservation-state";
import {
  applyCurrentUser,
  applyLogin,
  initialAuthState,
  isAuthenticated,
} from "@/contexts/auth-state";
import type { ApiErrorEnvelope } from "@/api/client";
import type { CatalogMovie, CatalogMovieDetail, CatalogSession } from "@/types/catalog";
import type {
  CheckoutResponse,
  ReservedSeat,
  SessionSeatMapItem,
  TemporaryReservationResponse,
} from "@/types/reservation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const movie: CatalogMovieDetail = {
  created_at: "2026-05-20T10:00:00-03:00",
  duration_minutes: 125,
  genres: [
    { id: "genre-adventure", name: "Aventura" },
    { id: "genre-drama", name: "Drama" },
  ],
  id: "movie-123",
  is_featured: true,
  poster_url: "https://cdn.example.com/a-jornada.jpg",
  release_date: "2026-05-13",
  status: "em_cartaz",
  synopsis: "Uma família encontra novas histórias em uma viagem por Natal.",
  title: "A Jornada",
  updated_at: "2026-05-21T10:00:00-03:00",
};

const preSaleMovie: CatalogMovie = {
  duration_minutes: 108,
  genres: [{ id: "genre-animation", name: "Animação" }],
  id: "movie-456",
  is_featured: false,
  poster_url: "https://cdn.example.com/estreia.jpg",
  status: "pre_venda",
  title: "Estreia da Semana",
};

const session: CatalogSession = {
  base_price: "42.50",
  created_at: "2026-05-21T10:00:00-03:00",
  end_time: "2026-05-25T20:35:00-03:00",
  id: "session-123",
  movie,
  room: {
    capacity: 80,
    id: "room-1",
    name: "Sala 1",
  },
  start_time: "2026-05-25T18:30:00-03:00",
  updated_at: "2026-05-21T10:00:00-03:00",
};

const seatMap: SessionSeatMapItem[] = [
  {
    is_accessible: false,
    lock_expires_at: null,
    number: 7,
    reserved_by_current_user: false,
    row: "B",
    seat_id: "seat-b7",
    session_seat_id: "session-seat-b7",
    status: "AVAILABLE",
  },
  {
    is_accessible: true,
    lock_expires_at: null,
    number: 8,
    reserved_by_current_user: false,
    row: "B",
    seat_id: "seat-b8",
    session_seat_id: "session-seat-b8",
    status: "AVAILABLE",
  },
  {
    is_accessible: false,
    lock_expires_at: null,
    number: 9,
    reserved_by_current_user: false,
    row: "B",
    seat_id: "seat-b9",
    session_seat_id: "session-seat-b9",
    status: "PURCHASED",
  },
];

const reservationResponse: TemporaryReservationResponse = {
  expires_at: "2026-05-25T18:40:00-03:00",
  seats: [
    {
      number: 7,
      row: "B",
      seat_id: "seat-b7",
      status: "RESERVED",
    },
    {
      number: 8,
      row: "B",
      seat_id: "seat-b8",
      status: "RESERVED",
    },
  ],
  session_id: "session-123",
  status: "RESERVED",
};

const checkoutResponse: CheckoutResponse = {
  payment_method: "pix",
  seats: [
    {
      amount_paid: "42.50",
      number: 7,
      row: "B",
      seat_id: "seat-b7",
      session_seat_id: "session-seat-b7",
      status: "PURCHASED",
      ticket_type: "inteira",
    },
    {
      amount_paid: "21.25",
      number: 8,
      row: "B",
      seat_id: "seat-b8",
      session_seat_id: "session-seat-b8",
      status: "PURCHASED",
      ticket_type: "meia",
    },
  ],
  status: "PURCHASED",
  tickets: [
    {
      amount_paid: "42.50",
      movie: {
        id: "movie-123",
        title: "A Jornada",
      },
      payment_method: "pix",
      room: {
        id: "room-1",
        name: "Sala 1",
      },
      seat: {
        id: "seat-b7",
        identifier: "B7",
        number: 7,
        row: "B",
      },
      seat_id: "seat-b7",
      session: {
        end_time: "2026-05-25T20:35:00-03:00",
        id: "session-123",
        start_time: "2026-05-25T18:30:00-03:00",
      },
      session_seat_id: "session-seat-b7",
      ticket_code: "CNP-B7",
      ticket_id: "ticket-b7",
      ticket_type: "inteira",
    },
    {
      amount_paid: "21.25",
      movie: {
        id: "movie-123",
        title: "A Jornada",
      },
      payment_method: "pix",
      room: {
        id: "room-1",
        name: "Sala 1",
      },
      seat: {
        id: "seat-b8",
        identifier: "B8",
        number: 8,
        row: "B",
      },
      seat_id: "seat-b8",
      session: {
        end_time: "2026-05-25T20:35:00-03:00",
        id: "session-123",
        start_time: "2026-05-25T18:30:00-03:00",
      },
      session_seat_id: "session-seat-b8",
      ticket_code: "CNP-B8",
      ticket_id: "ticket-b8",
      ticket_type: "meia",
    },
  ],
  total_amount: "63.75",
};

const userResponse = {
  created_at: "2026-05-21T10:00:00-03:00",
  email: "cliente@example.com",
  id: "user-123",
  username: "cliente",
};

test("mocked integration covers home to confirmation purchase journey", async () => {
  const requests: RecordedRequest[] = [];

  await withMockedFetch(
    [
      route("GET", "/api/v1/catalog/movies/?is_featured=true", paginated([movie])),
      route("GET", "/api/v1/catalog/movies/?status=em_cartaz", paginated([movie])),
      route("GET", "/api/v1/catalog/movies/?status=pre_venda", paginated([preSaleMovie])),
      route("GET", "/api/v1/catalog/movies/movie-123/", movie),
      route("GET", "/api/v1/catalog/sessions/?movie=movie-123&date=2026-05-25", paginated([session])),
      route("GET", "/api/v1/reservation/sessions/session-123/seats/", seatMap),
      route("GET", "/api/v1/catalog/sessions/session-123/", session),
      route("POST", "/api/v1/reservation/sessions/session-123/reservations/", reservationResponse, 201),
      route("POST", "/api/v1/reservation/checkout/", checkoutResponse),
    ],
    requests,
    async () => {
      const featured = await catalogApi.listFeaturedMovies();
      const nowShowing = await catalogApi.listNowShowingMovies();
      const preSale = await catalogApi.listPreSaleMovies();
      const homeHtml = renderToStaticMarkup(
        createElement(HomeCatalogSections, {
          featured: { movies: featured.results, status: "success" },
          nowShowing: { movies: nowShowing.results, status: "success" },
          preSale: { movies: preSale.results, status: "success" },
        })
      );

      assert.match(homeHtml, /Filme em destaque: A Jornada/);
      assert.match(homeHtml, /href="\/movies\/movie-123"/);
      assert.match(homeHtml, /Pré-venda/);

      const movieDetail = await catalogApi.getMovie("movie-123");
      const movieHtml = renderToStaticMarkup(
        createElement(MovieDetailView, {
          state: {
            movie: movieDetail,
            status: "success",
          },
        })
      );

      assert.match(movieHtml, /A Jornada/);
      assert.match(movieHtml, /Sinopse/);
      assert.match(movieHtml, /Sessões/);

      const sessions = await catalogApi.getSessions({
        date: "2026-05-25",
        movie: movieDetail.id,
      });

      assert.equal(sessions.results[0].id, "session-123");

      const [loadedSeats, loadedSession] = await Promise.all([
        reservationApi.getSeatMap("session-123"),
        catalogApi.getSession("session-123"),
      ]);
      const seatHtml = renderToStaticMarkup(
        createElement(SeatMapLayout, { seats: loadedSeats })
      );

      assert.match(seatHtml, /Mapa de assentos/);
      assert.match(seatHtml, /Assento B1/);
      assert.match(seatHtml, /assento original B7/);
      assert.match(seatHtml, /seat-map__seat--purchased/);

      setApiAuthController({
        getAccessToken: () => "access-token",
        refreshAccessToken: async () => null,
      });

      const reservationApiResponse = await reservationApi.reserveSeats(
        "session-123",
        ["seat-b7", "seat-b8"]
      );
      const reservedSeats = buildReservedSeatsFromReservation(
        reservationApiResponse,
        loadedSeats,
        Number(loadedSession.base_price),
        reservationApiResponse.expires_at
      );
      let reservationState = addSeatsToReservation(
        initialReservationState,
        reservedSeats,
        "session-123"
      );

      assert.deepEqual(
        reservationState.reservedSeats.map((seat) => seat.sessionSeatId),
        ["session-seat-b7", "session-seat-b8"]
      );

      reservationState = setReservationTicketType(
        reservationState,
        "session-seat-b8",
        "meia"
      );
      const ticketTypesHtml = renderToStaticMarkup(
        createElement(TicketTypeSelectionForm, {
          onTicketTypeChange: () => undefined,
          reservedSeats: reservationState.reservedSeats,
          ticketTypes: reservationState.ticketTypes,
        })
      );

      assert.match(ticketTypesHtml, /Assento/);
      assert.match(ticketTypesHtml, /B7/);
      assert.match(ticketTypesHtml, /B8/);
      assert.match(ticketTypesHtml, /Meia-entrada/);
      assert.match(ticketTypesHtml, /R\$\s*63,75/);

      reservationState = setReservationPaymentMethod(reservationState, "pix");
      const checkoutPayload = buildCheckoutPayload({
        paymentMethod: "pix",
        reservedSeats: reservationState.reservedSeats,
        ticketTypes: reservationState.ticketTypes,
      });

      assert.deepEqual(checkoutPayload, {
        payment_method: "pix",
        seats: [
          {
            session_seat_id: "session-seat-b7",
            ticket_type: "inteira",
          },
          {
            session_seat_id: "session-seat-b8",
            ticket_type: "meia",
          },
        ],
      });
      assert.equal(Object.hasOwn(checkoutPayload, "total_amount"), false);

      const result = await checkoutApi.checkout(checkoutPayload);
      const confirmedState = storeCheckoutResult(result);
      const confirmationHtml = renderToStaticMarkup(
        createElement(CheckoutConfirmationContent, {
          checkoutResult: confirmedState.checkoutResult,
        })
      );

      assert.match(confirmationHtml, /Compra confirmada/);
      assert.match(confirmationHtml, /A Jornada/);
      assert.match(confirmationHtml, /CNP-B7/);
      assert.match(confirmationHtml, /CNP-B8/);
    }
  );

  assert.deepEqual(
    requests.map(({ body, method, path }) => ({ body, method, path })),
    [
      { body: undefined, method: "GET", path: "/api/v1/catalog/movies/?is_featured=true" },
      { body: undefined, method: "GET", path: "/api/v1/catalog/movies/?status=em_cartaz" },
      { body: undefined, method: "GET", path: "/api/v1/catalog/movies/?status=pre_venda" },
      { body: undefined, method: "GET", path: "/api/v1/catalog/movies/movie-123/" },
      {
        body: undefined,
        method: "GET",
        path: "/api/v1/catalog/sessions/?movie=movie-123&date=2026-05-25",
      },
      { body: undefined, method: "GET", path: "/api/v1/reservation/sessions/session-123/seats/" },
      { body: undefined, method: "GET", path: "/api/v1/catalog/sessions/session-123/" },
      {
        body: JSON.stringify({ seat_ids: ["seat-b7", "seat-b8"] }),
        method: "POST",
        path: "/api/v1/reservation/sessions/session-123/reservations/",
      },
      {
        body: JSON.stringify({
          payment_method: "pix",
          seats: [
            { session_seat_id: "session-seat-b7", ticket_type: "inteira" },
            { session_seat_id: "session-seat-b8", ticket_type: "meia" },
          ],
        }),
        method: "POST",
        path: "/api/v1/reservation/checkout/",
      },
    ]
  );

  assertFixturesMatchPrdContracts();
});

test("login redirect preserves and returns to the originally requested route", async () => {
  const protectedDecision = getProtectedRouteDecision({
    isAuthenticated: false,
    status: "unauthenticated",
  });

  assert.deepEqual(protectedDecision, {
    redirectToLogin: true,
    renderContent: false,
  });

  const loginPath = "/login?redirect=%2Fcheckout%3Fstep%3Dpayment";

  await withMockedFetch(
    [
      route("POST", "/api/v1/auth/login/", {
        access: "access-token",
        refresh: "refresh-token",
      }),
      route("GET", "/api/v1/users/me/", userResponse),
    ],
    [],
    async () => {
      const loadingState = applyLogin(initialAuthState, await authApi.login({
        email: "cliente@example.com",
        password: "secret",
      }));
      assert.equal(loadingState.status, "loading");

      const currentUser = await authApi.currentUser(loadingState.accessToken ?? undefined);
      const authenticatedState = applyCurrentUser(loadingState, currentUser);

      assert.equal(isAuthenticated(authenticatedState), true);
      assert.equal(getSafeRedirectFromSearch("?redirect=%2Fcheckout%3Fstep%3Dpayment"), "/checkout?step=payment");
      assert.equal(getSafeRedirectFromSearch(new URL(loginPath, "http://frontend.local").search), "/checkout?step=payment");
    }
  );
});

test("protected routes redirect unauthenticated users without rendering protected content", () => {
  assert.deepEqual(
    getProtectedRouteDecision({
      isAuthenticated: false,
      status: "loading",
    }),
    {
      redirectToLogin: false,
      renderContent: false,
    }
  );
  assert.deepEqual(
    getProtectedRouteDecision({
      isAuthenticated: false,
      status: "unauthenticated",
    }),
    {
      redirectToLogin: true,
      renderContent: false,
    }
  );
});

test("attempting to reserve as a visitor redirects back to the seat route", () => {
  const decision = getGuardedActionDecision({
    currentPath: "/sessions/session-123/seats?from=detail#B7",
    isAuthenticated: false,
    status: "unauthenticated",
  });

  assert.deepEqual(decision, {
    allowed: false,
    loginUrl:
      "/login?redirect=%2Fsessions%2Fsession-123%2Fseats%3Ffrom%3Ddetail%23B7",
    pending: false,
  });
});

test("reservation expiration resets reservation state and exposes recovery feedback", () => {
  const reservedSeats = buildReservedSeatsFromReservation(
    {
      ...reservationResponse,
      expires_at: "2026-05-24T10:00:00-03:00",
    },
    seatMap,
    Number(session.base_price),
    "2026-05-24T10:00:00-03:00"
  );
  const activeState = addSeatsToReservation(
    initialReservationState,
    reservedSeats,
    "session-123"
  );
  const decision = getPurchaseFlowGuardDecision({
    hasReservedSeats: activeState.reservedSeats.length > 0,
    isExpired: true,
    sessionId: activeState.sessionId,
  });

  assert.deepEqual(decision, {
    message: PURCHASE_FLOW_EXPIRED_MESSAGE,
    redirectPath: "/sessions/session-123/seats",
    renderContent: false,
    shouldResetExpiredReservation: true,
    title: "Reserva expirada",
  });

  const expiredState = expireReservation(activeState, decision.message ?? "");
  const releasedSeats = markSeatsAsAvailableBySessionSeatIds(
    markSeatsAsReservedBySeatIds(seatMap, ["seat-b7", "seat-b8"]),
    reservedSeats.map((seat) => seat.sessionSeatId)
  );
  const seatHtml = renderToStaticMarkup(
    createElement(SeatMapLayout, {
      errorMessage: expiredState.expirationNotice,
      seats: releasedSeats,
    })
  );

  assert.equal(expiredState.reservedSeats.length, 0);
  assert.equal(expiredState.expiredSessionId, "session-123");
  assert.match(seatHtml, /Sua reserva temporária expirou/);
  assert.equal(getSeatVisualState(releasedSeats[0], new Set()), "available");
  assert.equal(getSeatVisualState(releasedSeats[1], new Set()), "available");
});

test("SEAT_ALREADY_RESERVED conflicts revert optimistic seat UI state", async () => {
  const targetSeat = seatMap[0];
  const optimisticSeats = markSeatsAsReservedBySeatIds(seatMap, [targetSeat.seat_id]);

  assert.equal(getSeatVisualState(optimisticSeats[0], new Set()), "selected");

  await withMockedFetch(
    [
      routeError("POST", "/api/v1/reservation/sessions/session-123/reservations/", {
        error: {
          code: "SEAT_ALREADY_RESERVED",
          details: {},
          message: "One or more selected seats are already reserved or purchased.",
          status: 409,
        },
      }),
    ],
    [],
    async () => {
      setApiAuthController({
        getAccessToken: () => "access-token",
        refreshAccessToken: async () => null,
      });

      let conflictError: unknown;

      try {
        await reservationApi.reserveSeats("session-123", [targetSeat.seat_id]);
      } catch (error) {
        conflictError = error;
      }

      assert.ok(conflictError instanceof ApiError);
      assert.equal(conflictError.code, "SEAT_ALREADY_RESERVED");

      const revertedSeats = restoreSeatSnapshots(optimisticSeats, [targetSeat]);
      const message = getSeatInteractionErrorMessage(conflictError);

      assert.equal(getSeatVisualState(revertedSeats[0], new Set()), "available");
      assert.match(message, /assento/);
      assert.match(message, /reservado/);
      assert.doesNotMatch(message, /One or more selected seats/);
    }
  );
});

test("recoverable checkout failures preserve current order state", async () => {
  const reservedSeats = buildReservedSeatsFromReservation(
    reservationResponse,
    seatMap,
    Number(session.base_price),
    reservationResponse.expires_at
  );
  let reservationState = addSeatsToReservation(
    initialReservationState,
    reservedSeats,
    "session-123"
  );
  reservationState = setReservationTicketType(
    reservationState,
    "session-seat-b8",
    "meia"
  );
  reservationState = setReservationPaymentMethod(reservationState, "pix");

  const beforeCheckout = cloneRecoverableOrderState(reservationState.reservedSeats);

  await withMockedFetch(
    [
      routeError("POST", "/api/v1/reservation/checkout/", {
        error: {
          code: "INVALID_PAYMENT_METHOD",
          details: {},
          message: "Unrecognized payment_method value.",
          status: 400,
        },
      }),
    ],
    [],
    async () => {
      setApiAuthController({
        getAccessToken: () => "access-token",
        refreshAccessToken: async () => null,
      });

      const payload = buildCheckoutPayload({
        paymentMethod: "pix",
        reservedSeats: reservationState.reservedSeats,
        ticketTypes: reservationState.ticketTypes,
      });

      let failure: unknown;

      try {
        await checkoutApi.checkout(payload);
      } catch (error) {
        failure = error;
      }

      assert.ok(failure instanceof ApiError);
      assert.equal(failure.code, "INVALID_PAYMENT_METHOD");
      assert.deepEqual(cloneRecoverableOrderState(reservationState.reservedSeats), beforeCheckout);
      assert.deepEqual(reservationState.ticketTypes, {
        "session-seat-b7": "inteira",
        "session-seat-b8": "meia",
      });
      assert.equal(reservationState.paymentMethod, "pix");
      assert.equal(reservationState.checkoutResult, null);

      const message = getCheckoutErrorMessage(failure);

      assert.equal(message, getApiErrorUserMessage(failure));
      assert.match(message, /forma de pagamento/);
      assert.doesNotMatch(message, /Unrecognized payment_method/);
    }
  );
});

type RecordedRequest = {
  body: string | undefined;
  method: string;
  path: string;
};

type MockRoute = {
  body: unknown;
  method: string;
  path: string;
  status: number;
};

function route(
  method: string,
  path: string,
  body: unknown,
  status = 200
): MockRoute {
  return {
    body,
    method,
    path,
    status,
  };
}

function routeError(
  method: string,
  path: string,
  body: ApiErrorEnvelope
): MockRoute {
  return route(method, path, body, body.error.status);
}

async function withMockedFetch(
  routes: MockRoute[],
  requests: RecordedRequest[],
  callback: () => Promise<void>
) {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const path = `${url.pathname}${url.search}`;
      const body = init?.body?.toString();
      const matchedRoute = routes.find(
        (candidate) => candidate.method === method && candidate.path === path
      );

      requests.push({ body, method, path });

      if (!matchedRoute) {
        return Response.json(
          {
            error: {
              code: "RESOURCE_NOT_FOUND",
              details: { method, path },
              message: "No mocked route matched the request.",
              status: 404,
            },
          },
          { status: 404 }
        );
      }

      return Response.json(matchedRoute.body, { status: matchedRoute.status });
    };

    await callback();
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
}

function paginated<T>(results: T[]) {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
  };
}

function cloneRecoverableOrderState(reservedSeats: ReservedSeat[]) {
  return reservedSeats.map((seat) => ({
    basePrice: seat.basePrice,
    expiresAt: seat.expiresAt.toISOString(),
    isAccessible: seat.isAccessible,
    number: seat.number,
    row: seat.row,
    seatId: seat.seatId,
    sessionSeatId: seat.sessionSeatId,
  }));
}

function assertFixturesMatchPrdContracts() {
  const serializedFixtures = JSON.stringify({
    checkoutResponse,
    movie,
    preSaleMovie,
    reservationResponse,
    seatMap,
    session,
  });

  assert.doesNotMatch(serializedFixtures, /age_rating|room_type|audio_format/);
  assert.equal(typeof movie.duration_minutes, "number");
  assert.equal(movie.status, "em_cartaz");
  assert.equal(preSaleMovie.status, "pre_venda");
  assert.equal(typeof session.base_price, "string");
  assert.deepEqual(
    reservationResponse.seats.map((seat) => Object.keys(seat).sort()),
    [
      ["number", "row", "seat_id", "status"],
      ["number", "row", "seat_id", "status"],
    ]
  );
  assert.deepEqual(
    checkoutResponse.seats.map(({ session_seat_id, ticket_type }) => ({
      session_seat_id,
      ticket_type,
    })),
    [
      { session_seat_id: "session-seat-b7", ticket_type: "inteira" },
      { session_seat_id: "session-seat-b8", ticket_type: "meia" },
    ]
  );
}
