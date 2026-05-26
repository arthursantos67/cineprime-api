# Cineprime Natal - Frontend Product Requirements Document

## Frontend Software Requirements Specification

**Project:** cineprime-natal
**Document type:** Product Requirements Document (PRD) - Frontend only  
**Version:** 1.1  
**Last update:** 2026-05-21  
**Derived from:** Full-Stack PRD v2.0 (2026-05-13)  
**Audited against:** current Next.js scaffold, backend serializers/views, README files, Docker configuration, and CI workflow

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [System Context](#2-system-context)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Functional Requirements](#4-functional-requirements)
5. [Use Cases](#5-use-cases)
6. [Page and Component Specification](#6-page-and-component-specification)
7. [API Integration Contract](#7-api-integration-contract)
8. [State Management Strategy](#8-state-management-strategy)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Security and Access Control](#10-security-and-access-control)
11. [Testing Requirements](#11-testing-requirements)
12. [Operational Requirements](#12-operational-requirements)
13. [Requirements Traceability Matrix](#13-requirements-traceability-matrix)
14. [Out of Scope](#14-out-of-scope)

---

## 1. Purpose and Scope

This document defines the frontend requirements for **Cineprime Natal**, a browser-based cinema ticket reservation platform. The frontend is a Next.js web application that consumes the Django/DRF REST API to support the complete purchase journey: movie discovery, session selection, seat selection, ticket type selection, checkout, order confirmation, and access to purchased tickets.

This PRD is derived from the full-stack PRD and focuses only on frontend behavior, user experience, API integration, client-side state, accessibility, quality requirements, and operational expectations. Backend models, server infrastructure, Redis, Celery, and database concerns are documented in the full-stack PRD and backend README.

### 1.1 Current Repository State

The current frontend is a Next.js App Router scaffold with placeholder pages, a shared HTTP client in `src/api/client.ts`, unit tests using the Node.js test runner with `tsx`, ESLint validation, and production build validation in GitHub Actions.

This document describes the intended complete frontend product, while keeping routes, payloads, response fields, and implementation expectations aligned with the backend and scaffold that currently exist in the repository.

### 1.2 Product Goals

- Provide a smooth ticket purchase experience from catalog browsing to checkout.
- Minimize friction in the reservation flow with immediate, clear UI feedback.
- Represent temporary seat reservations, lock expiration, and checkout state accurately in the UI.
- Keep protected operations secure without exposing tokens in persistent browser storage.
- Make the application accessible and usable on both desktop and mobile devices.

### 1.3 In Scope

- All frontend routes currently represented by the Next.js scaffold.
- Shared UI components and page-specific behavior.
- Authentication, route guarding, and JWT handling on the client.
- API integration contracts for all backend endpoints used by the frontend.
- Client-side reservation state and checkout state.
- Frontend accessibility, responsiveness, performance, and testability requirements.
- Alignment with the current scaffold routes: `/ticket-types`, `/confirmation`, and `/my-tickets`.

### 1.4 Out of Scope for This Document

- Backend business logic, data models, and infrastructure internals.
- Celery, Redis, PostgreSQL, and backend deployment details.
- Real payment gateway integration.
- Backend fields that do not currently exist, such as `age_rating`, `room_type`, and `audio_format`, except where explicitly listed as future evolution.

---

## 2. System Context

### 2.1 Frontend Positioning

The frontend is a Next.js web application consumed through the user's browser. All durable data and business rules are delegated to the backend through HTTP(S) REST API calls. The frontend must not access the database, Redis, Celery, or other backend infrastructure directly.

```text
User Browser
  |
  | Next.js frontend
  | Pages -> Components -> API client
  |
  | HTTP(S) with Bearer JWT
  v
Django/DRF REST API
```

### 2.2 Actors

| Actor | Description | Frontend Capabilities |
|---|---|---|
| Visitor | Unauthenticated user | Browse home, catalog, movie details, and seat maps; access login and registration |
| Authenticated User | User with a valid JWT access token | All visitor capabilities plus: reserve seats, choose ticket types, checkout, view profile, and view purchased tickets |

### 2.3 Integration Constraints

- The frontend must consume only the backend REST API.
- The API base URL is configured through `NEXT_PUBLIC_API_BASE_URL`.
- JWT tokens must never be stored in `localStorage` or `sessionStorage`.
- Error responses follow the backend envelope `{ error: { code, message, status, details } }`.
- User-facing error messages must be derived from `error.code`, not by directly displaying backend English messages.

---

## 3. Frontend Architecture

### 3.1 Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 with App Router |
| Language | TypeScript |
| Styling | Global CSS or CSS Modules; Tailwind CSS only if added as a project dependency |
| State Management | React Context and custom hooks; Zustand/Jotai may be introduced if complexity justifies it |
| API Communication | Native `fetch` wrapped by `src/api/client.ts` |
| Tests | Node.js test runner with `tsx` for current pure modules; Testing Library and Playwright/Cypress when UI flows are implemented |
| Linting | ESLint |

### 3.2 Suggested Directory Structure

```text
frontend/
`-- src/
    |-- app/
    |   |-- page.tsx
    |   |-- movies/[movieId]/page.tsx
    |   |-- sessions/[sessionId]/seats/page.tsx
    |   |-- ticket-types/page.tsx
    |   |-- checkout/page.tsx
    |   |-- confirmation/page.tsx
    |   |-- my-tickets/page.tsx
    |   |-- login/page.tsx
    |   `-- register/page.tsx
    |-- api/
    |   |-- client.ts
    |   |-- auth.ts
    |   |-- catalog.ts
    |   |-- reservation.ts
    |   `-- tickets.ts
    |-- components/
    |   |-- ui/
    |   |-- layout/
    |   |-- movies/
    |   |-- seats/
    |   |-- checkout/
    |   `-- tickets/
    |-- contexts/
    |-- hooks/
    `-- types/
        `-- api.ts
```

### 3.3 API Client Layer

The `src/api/` modules must encapsulate all HTTP calls.

Responsibilities:

- Resolve the API base URL from `NEXT_PUBLIC_API_BASE_URL`.
- Attach `Authorization: Bearer <access_token>` to protected requests.
- Attempt token refresh when a protected request returns `401`.
- Redirect to `/login` when refresh fails.
- Preserve the backend error envelope inside a typed `ApiError`.
- Preserve `status`, `error.code`, `error.details`, and correlation metadata when available.
- Handle DRF paginated list responses in the shape `{ count, next, previous, results }`.
- Expose domain-specific typed functions such as `catalogApi.getMovies()`, `reservationApi.reserveSeats()`, and `checkoutApi.checkout()`.

---

## 4. Functional Requirements

### FE-01 Home Page

The home page must display a featured movie banner using movies where `is_featured = true`.

Below the banner, the page must show two catalog sections:

- **Now Showing**: movies with `status = em_cartaz`
- **Pre-Sale**: movies with `status = pre_venda`

Each movie card must show poster, title, genres, and duration. Clicking a movie card must navigate to `/movies/{movieId}`.

The current backend does not expose an age rating field. The frontend must not invent or hard-code age rating values. Age rating badges may be added only after the backend exposes a compatible field.

### FE-02 Movie Detail and Session Selection Page

The movie detail page must show:

- Movie poster and title
- Synopsis
- Genres
- Duration
- Release date when useful to the UI

The page must provide a date selector. When a date is selected, the frontend must fetch sessions with:

```text
GET /api/v1/catalog/sessions/?movie=<movieId>&date=<YYYY-MM-DD>
```

Sessions must be grouped by room name and time. The current backend does not expose room type or audio format, so those values must not appear in the UI unless added to the API contract later.

Selecting a session must navigate to `/sessions/{sessionId}/seats`.

### FE-03 Seat Selection Page

The seat selection page must render an interactive visual map for the selected session.

Requirements:

- Show a "SCREEN" indicator above the first row.
- Show alphabetical row labels on both sides of the grid.
- Render seats by row and number.
- Preserve room-layout readability on narrow screens with horizontal scrolling if needed.
- Visually distinguish available, selected, reserved, purchased, and accessible seats.
- Display a required legend explaining all seat states.
- Allow visitors to view the seat map without authentication.
- Require authentication for reserve and release actions.
- When an unauthenticated user attempts to reserve a seat, redirect to `/login?redirect=<current_url>`.
- Reserve available seats through `POST /api/v1/reservation/sessions/{sessionId}/reservations/` with `seat_ids`.
- Release the current user's temporary reservation through `DELETE /api/v1/reservation/sessions/{sessionId}/reservations/` with `session_seat_ids`.
- Apply optimistic UI updates and revert them if locking fails.
- Display a countdown timer based on the backend `expires_at` value.
- Persist both `seat_id` and `session_seat_id` in client state, because temporary reservation receives `seat_id`, while release and checkout receive `session_seat_id`.

### FE-04 Ticket Type Selection Page

After reserving at least one seat, the user must proceed to `/ticket-types`.

For each reserved seat, the user must choose:

- **Full price**: API value `inteira`
- **Half price**: API value `meia`, priced at 50% of the session `base_price`

The subtotal must update immediately as ticket types change. A voucher/coupon input must be present, but coupon validation is out of scope for this version.

### FE-05 Checkout and Payment Page

The checkout page must show:

- Movie title
- Session date and time
- Room
- Selected seats
- Ticket type per seat
- Unit price per seat
- Total amount
- Payment method selector with `cartao_credito` and `pix`

On confirmation, the page must:

1. Submit the checkout payload to the backend.
2. Show a loading state while the request is in progress.
3. Redirect to `/confirmation` on success.
4. Store the generated tickets in memory for the confirmation page.
5. Show a friendly error message derived from `error.code` on failure.

The frontend must not send `total_amount` in the default checkout payload. The total shown in the UI is informational; authoritative pricing belongs to the backend.

### FE-06 Order Confirmation and My Tickets

After checkout succeeds, the confirmation page must display the generated tickets.

Each ticket must show:

- Movie title
- Session date and time
- Room
- Seat identifier
- Ticket type
- Amount paid
- Payment method
- Ticket code
- Display-only QR code or barcode representation

If `/confirmation` is reloaded and in-memory checkout state is lost, the page must guide the user to `/my-tickets`.

The `/my-tickets` page must list authenticated user tickets and support filtering by `type=upcoming` and `type=past`.

### FE-07 Authentication Flow

The frontend must provide:

- Registration form with `username`, `email`, and `password`
- Login form with `email` and `password`

After successful login:

- Store `access` and `refresh` tokens in memory.
- Attach the access token to protected API requests.
- Attempt silent refresh through `/api/v1/auth/token/refresh/` when the access token expires.
- Redirect to `/login?redirect=<original_url>` when refresh fails.
- Redirect back to the original URL after successful login when a redirect parameter is present.

---

## 5. Use Cases

### UC-1 Register User

**Actor:** Visitor  
**Precondition:** none  
**Main flow:** The visitor opens `/register`, submits username, email, and password, and the frontend calls `POST /api/v1/auth/register/`. On success, the user is redirected to `/login` with a confirmation message.  
**Alternative flow:** Validation errors from `VALIDATION_FAILED` are displayed inline.

### UC-2 Log In

**Actor:** Visitor  
**Precondition:** registered account exists  
**Main flow:** The visitor opens `/login`, submits email and password, and the frontend calls `POST /api/v1/auth/login/`. Tokens are stored in memory, and the user is redirected to the original URL or `/`.  
**Alternative flow:** `INVALID_CREDENTIALS` displays a form-level error.

### UC-3 Browse Home Page

**Actor:** Visitor or Authenticated User  
**Main flow:** The frontend fetches featured movies, now showing movies, and pre-sale movies. Skeleton loaders are shown while requests are in progress.

### UC-4 View Movie Details and Select Session

**Actor:** Visitor or Authenticated User  
**Main flow:** The user clicks a movie card, opens `/movies/{movieId}`, selects a date, views sessions filtered by movie and date, and selects a session. The frontend navigates to `/sessions/{sessionId}/seats`.

### UC-5 View Seat Map and Reserve Seats

**Actor:** Visitor or Authenticated User for viewing; Authenticated User for reservation  
**Precondition:** session selected  
**Main flow:** The frontend fetches the seat map and renders it. The authenticated user selects available seats. For each reservation operation, the frontend calls the temporary reservation endpoint, updates the UI optimistically, and starts or updates the countdown.  
**Alternative flow:** If locking fails with `SEAT_ALREADY_RESERVED`, the UI reverts the seat and shows a toast.

### UC-6 Select Ticket Types

**Actor:** Authenticated User  
**Precondition:** at least one active temporary reservation  
**Main flow:** The user opens `/ticket-types`, selects `inteira` or `meia` per seat, and the subtotal updates immediately. On confirmation, the user is sent to `/checkout`.

### UC-7 Complete Checkout

**Actor:** Authenticated User  
**Precondition:** reserved seats and ticket types selected  
**Main flow:** The user reviews the order, selects a payment method, and confirms checkout. The frontend submits the checkout payload. On success, tickets are stored in memory and the user is redirected to `/confirmation`.  
**Alternative flow:** API errors are shown without clearing the current order state when recovery is possible.

### UC-8 View Confirmation and My Tickets

**Actor:** Authenticated User  
**Precondition:** successful checkout  
**Main flow:** The confirmation page displays generated tickets. The user can navigate to `/my-tickets` and filter tickets by upcoming or past sessions.

### UC-9 Reservation Expiration

**Actor:** Authenticated User  
**Precondition:** active reservation reaches expiration  
**Main flow:** The countdown warns the user near expiration. When expired, the reservation state is reset and the user is redirected to a safe page with an explanatory message.

### UC-10 Browse Catalog Without Authentication

**Actor:** Visitor  
**Main flow:** The visitor can browse home, movie detail, sessions, and seat maps. Attempting to reserve a seat redirects to login while preserving the intended destination.

---

## 6. Page and Component Specification

### 6.1 Page Inventory

| Page | Route | Authentication |
|---|---|---|
| Home | `/` | No |
| Movie Detail | `/movies/{movieId}` | No |
| Seat Selection | `/sessions/{sessionId}/seats` | Partial: map is public, reservation actions require authentication |
| Ticket Type Selection | `/ticket-types` | Yes |
| Checkout | `/checkout` | Yes |
| Order Confirmation | `/confirmation` | Yes |
| My Tickets | `/my-tickets` | Yes |
| Login | `/login` | No |
| Register | `/register` | No |

These routes reflect the current scaffold in `frontend/src/app`. If the product later requires direct order recovery or reload-safe reservation URLs, new parameterized routes and matching backend endpoints must be added together.

### 6.2 Shared Components

#### Navigation Bar

- Shows the Cineprime Natal brand.
- Provides links for the main movie programming areas.
- Shows "Log in" and "Register" actions for visitors.
- Shows "My Tickets" and "Log out" actions for authenticated users.

#### Movie Card

- Shows poster, title, genres, and duration.
- Navigates to `/movies/{movieId}`.
- Displays age rating only after the backend supports it.

#### Featured Banner

- Displays movies marked with `is_featured = true`.
- Shows poster imagery, title, and a primary purchase/session-selection action.

#### Countdown Timer

- Displays remaining reservation time as `mm:ss`.
- Uses the backend `expires_at` value.
- Applies warning styling when 60 seconds or less remain.
- Triggers reservation reset behavior when time reaches zero.

#### Order Summary Panel

- Appears during seat selection, ticket type selection, and checkout.
- Uses a sidebar layout on desktop and a bottom sheet layout on mobile.
- Shows seats, ticket types, unit prices, and total amount.

#### Error Toast or Alert Banner

The frontend must map backend `error.code` values to user-friendly messages.

| `error.code` | User Message |
|---|---|
| `VALIDATION_FAILED` | "Please check the provided information and try again." |
| `INVALID_CREDENTIALS` | "Email or password is incorrect." |
| `NOT_AUTHENTICATED` | "Your session has expired. Please log in again." |
| `PERMISSION_DENIED` | "You do not have permission to perform this action." |
| `RESOURCE_NOT_FOUND` | "The requested resource could not be found." |
| `SEAT_ALREADY_RESERVED` | "This seat was reserved by another user. Please choose another seat." |
| `INVALID_TICKET_TYPE` | "The selected ticket type is invalid." |
| `INVALID_PAYMENT_METHOD` | "The selected payment method is invalid." |
| `THROTTLED` | "Too many attempts. Please wait and try again." |
| `INTERNAL_SERVER_ERROR` | "An unexpected error occurred. Please try again later." |

### 6.3 Seat Map

The seat map is derived from `GET /api/v1/reservation/sessions/{sessionId}/seats/`.

| API State | UI State | Behavior |
|---|---|---|
| `AVAILABLE` | Available | Selectable |
| `RESERVED` by current user | Selected | Can be released by current user |
| `RESERVED` by another user | Occupied | Disabled |
| `PURCHASED` | Occupied | Disabled |
| `is_accessible = true` | Accessible marker | Must include visual and semantic indication |

Rendering requirements:

- Render row labels alphabetically.
- Render seat numbers within each row.
- Include a screen indicator above the map.
- Include a legend for every state.
- Use buttons or button-like controls with accessible labels.
- Support keyboard navigation.

### 6.4 Checkout Step Indicator

The purchase flow must show progress across:

```text
Session -> Seats -> Ticket Types -> Checkout -> Confirmation
```

The order summary must stay available and synchronized during Seats, Ticket Types, and Checkout.

---

## 7. API Integration Contract

List endpoints are paginated by DRF with page size 10 and return:

```json
{
  "count": 0,
  "next": null,
  "previous": null,
  "results": []
}
```

The session seat map endpoint is not paginated.

### 7.1 Authentication

| Operation | Method | Endpoint | Auth |
|---|---|---|---|
| Register | `POST` | `/api/v1/auth/register/` | No |
| Login | `POST` | `/api/v1/auth/login/` | No |
| Refresh token | `POST` | `/api/v1/auth/token/refresh/` | No |
| Current user | `GET` | `/api/v1/users/me/` | Yes |

Login payload:

```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

Login response:

```json
{
  "access": "<jwt_access_token>",
  "refresh": "<jwt_refresh_token>"
}
```

### 7.2 Catalog

| Operation | Method | Endpoint | Auth | Query Parameters |
|---|---|---|---|---|
| List movies | `GET` | `/api/v1/catalog/movies/` | No | `status`, `is_featured` |
| Get movie | `GET` | `/api/v1/catalog/movies/{id}/` | No | none |
| List sessions | `GET` | `/api/v1/catalog/sessions/` | No | `movie`, `date`, `start_from`, `start_to` |
| Get session | `GET` | `/api/v1/catalog/sessions/{id}/` | No | none |

Relevant `Movie` fields:

- `id`
- `title`
- `genres`
- `synopsis`
- `duration_minutes`
- `release_date`
- `poster_url`
- `status`
- `is_featured`
- `created_at`
- `updated_at`

Relevant `Session` fields:

- `id`
- `movie`
- `room`
- `start_time`
- `end_time`
- `base_price`
- `created_at`
- `updated_at`

Important contract notes:

- The session movie filter is named `movie`, not `movie_id`.
- `movie` expects a UUID.
- The current backend does not expose `age_rating`, `room_type`, or `audio_format`.
- `genres` is a list of `{ id, name }`.

### 7.3 Seat Map

| Operation | Method | Endpoint | Auth |
|---|---|---|---|
| Get session seat map | `GET` | `/api/v1/reservation/sessions/{session_id}/seats/` | No |

Relevant fields:

- `session_seat_id`
- `seat_id`
- `row`
- `number`
- `status`
- `is_accessible`
- `reserved_by_current_user` when the request is authenticated
- `lock_expires_at` when the reservation belongs to the current user

### 7.4 Temporary Reservation

| Operation | Method | Endpoint | Auth |
|---|---|---|---|
| Reserve seats | `POST` | `/api/v1/reservation/sessions/{session_id}/reservations/` | Yes |
| Release reservations | `DELETE` | `/api/v1/reservation/sessions/{session_id}/reservations/` | Yes |

Reserve payload:

```json
{
  "seat_ids": ["a6c9d2e1-0a0d-44c4-8f03-0b5d8c19c001"]
}
```

Release payload:

```json
{
  "session_seat_ids": ["d8e03f21-3dc2-4328-9e96-c32c75c60001"]
}
```

Reserve response:

- Status: `201 Created`
- Body includes `session_id`, `status`, `expires_at`, and `seats`.
- Each returned seat includes `seat_id`, `row`, `number`, and `status`.
- The frontend must preserve the original `session_seat_id` from the seat map for release and checkout.

Release response:

- Status: `200 OK`
- Body includes `session_id`, `status`, and released seats.

Conflict response:

- Status: `409 Conflict`
- Error code: `SEAT_ALREADY_RESERVED`

### 7.5 Checkout

| Operation | Method | Endpoint | Auth |
|---|---|---|---|
| Complete checkout | `POST` | `/api/v1/reservation/checkout/` | Yes |

Payload:

```json
{
  "seats": [
    {
      "session_seat_id": "d8e03f21-3dc2-4328-9e96-c32c75c60001",
      "ticket_type": "inteira"
    },
    {
      "session_seat_id": "d8e03f21-3dc2-4328-9e96-c32c75c60002",
      "ticket_type": "meia"
    }
  ],
  "payment_method": "pix"
}
```

Success response:

- Status: `200 OK`
- Body includes `status`, `payment_method`, `total_amount`, `seats`, and `tickets`.

The backend accepts optional `total_amount` validation, but the frontend must not send it by default.

### 7.6 My Tickets

| Operation | Method | Endpoint | Auth | Query Parameters |
|---|---|---|---|---|
| List my tickets | `GET` | `/api/v1/users/me/tickets/` | Yes | `type=upcoming|past` |

Relevant ticket fields:

- `ticket_id`
- `ticket_code`
- `ticket_type`
- `amount_paid`
- `payment_method`
- `created_at`
- `movie`
- `session`
- `room`
- `seat`

Expected nested shape:

```json
{
  "ticket_id": "uuid",
  "ticket_code": "CODE",
  "ticket_type": "inteira",
  "amount_paid": "42.00",
  "payment_method": "pix",
  "movie": {
    "id": "uuid",
    "title": "Movie title",
    "poster_url": "https://example.com/poster.jpg"
  },
  "session": {
    "id": "uuid",
    "start_time": "2026-05-21T20:00:00Z",
    "end_time": "2026-05-21T22:00:00Z"
  },
  "room": {
    "id": "uuid",
    "name": "Room 1"
  },
  "seat": {
    "id": "uuid",
    "row": "A",
    "number": 1,
    "identifier": "A1"
  }
}
```

### 7.7 Standard Error Envelope

All API errors follow:

```json
{
  "error": {
    "code": "SEAT_ALREADY_RESERVED",
    "message": "One or more selected seats are already reserved or purchased.",
    "status": 409,
    "details": {}
  }
}
```

The frontend must map `error.code` to a user-facing message and must not display raw backend `error.message` directly.

---

## 8. State Management Strategy

### 8.1 Authentication State

Global authentication state must contain:

| Field | Type | Description |
|---|---|---|
| `accessToken` | `string \| null` | In-memory access token |
| `refreshToken` | `string \| null` | In-memory refresh token |
| `user` | `User \| null` | Current authenticated user |
| `isAuthenticated` | `boolean` | Derived authentication flag |

Required actions:

- `login()`: stores tokens and current user data.
- `logout()`: clears tokens, user data, and protected state.
- `refreshAccess()`: refreshes the access token after a `401`.

### 8.2 Reservation State

Reservation state must survive navigation between purchase steps but does not need to survive a full page reload.

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string \| null` | Selected session UUID |
| `reservedSeats` | `ReservedSeat[]` | Seats reserved by the current user |
| `ticketTypes` | `Record<sessionSeatId, TicketType>` | Selected ticket type per reserved seat |
| `paymentMethod` | `'cartao_credito' \| 'pix' \| null` | Selected payment method |
| `reservationExpiresAt` | `Date \| null` | Expiration timestamp from the backend |

Each `ReservedSeat` must include:

- `sessionSeatId`
- `seatId`
- `row`
- `number`
- `isAccessible`
- `basePrice`
- `expiresAt`

Required actions:

- `addSeats(seats)`
- `removeSeat(sessionSeatId)`
- `setTicketType(sessionSeatId, type)`
- `setPaymentMethod(method)`
- `resetReservation()`

Total calculation:

```ts
sum(
  seats.map((seat) =>
    seat.basePrice * (ticketTypes[seat.sessionSeatId] === "meia" ? 0.5 : 1)
  )
)
```

### 8.3 Page State

Page-specific data such as movie lists, session lists, and seat maps may be stored locally with React state/effects or through a data-fetching library such as SWR or React Query if added intentionally.

### 8.4 Purchase Flow Guards

In addition to authentication, `/ticket-types` and `/checkout` require an active reservation. If the user opens those routes without `reservedSeats`, the app must redirect to the last known session when possible. Otherwise, it must redirect to `/` with a clear message.

The `/confirmation` page may render tickets stored in memory immediately after checkout. If the page is reloaded and confirmation state is lost, it must guide the user to `/my-tickets`.

---

## 9. Non-Functional Requirements

### NFR-01 Performance

- The home page should become interactive within 3 seconds on a standard broadband connection.
- API loading states must use skeletons or spinners.
- Poster images must be lazy-loaded and responsive.
- Route-level code splitting must avoid unnecessary initial JavaScript.

### NFR-02 Accessibility

- Seat states must not rely on color alone.
- Accessible seats must be visually and semantically identified.
- Seat controls must be keyboard-navigable.
- Seat controls must include useful accessible labels.
- Form inputs must have labels and linked validation messages.
- Main flows should meet WCAG 2.1 AA expectations.

### NFR-03 Responsiveness

- The app must work on desktop viewports of 1024px and wider.
- The app must work on mobile viewports of 375px and wider.
- The order summary must become a mobile-friendly bottom sheet on small screens.
- Seat maps may scroll horizontally on narrow screens without losing functionality.

### NFR-04 Reliability and Feedback

- The countdown must align with backend `expires_at`.
- Network errors must show retry-friendly feedback.
- Recoverable API failures must preserve the current flow state where possible.
- Expired reservations must reset the reservation state and explain what happened.

### NFR-05 Client Security

- JWT tokens must not be stored in `localStorage` or `sessionStorage`.
- Access and refresh tokens are stored in memory in the current implementation.
- Refresh token storage may move to `httpOnly` cookies only if backend support is added.
- Protected pages must not flash authenticated content before redirecting.
- Sensitive values such as tokens or email addresses must not be placed in URLs.

### NFR-06 Localization

- User-facing UI text must be in Brazilian Portuguese.
- Dates, times, and currency values must use Brazilian formats.
- This PRD is written in English, but the product UI remains localized for pt-BR users.

---

## 10. Security and Access Control

### 10.1 Route Guards

Protected routes:

- `/ticket-types`
- `/checkout`
- `/confirmation`
- `/my-tickets`

The seat map route `/sessions/{sessionId}/seats` is public for viewing, but reservation and release actions require authentication. If a visitor attempts a protected action from that page, the app must redirect to `/login?redirect=<current_url>`.

### 10.2 Token Handling

| Event | Behavior |
|---|---|
| Successful login | Store `access` and `refresh` in memory |
| Protected request | Attach `Authorization: Bearer <access>` |
| `401` response | Try silent refresh through `/api/v1/auth/token/refresh/` |
| Refresh success | Retry the original request |
| Refresh failure | Clear auth state and redirect to login |
| Explicit logout | Clear auth and reservation state, then redirect to `/` |

### 10.3 Price Manipulation Protection

The frontend must not trust its own price calculation as authoritative. It displays totals for user clarity only. Checkout must send only `session_seat_id`, `ticket_type`, and `payment_method`; the backend calculates and validates final prices.

---

## 11. Testing Requirements

### 11.1 Unit and Component Tests

Current test stack:

- Node.js test runner
- `tsx`

Required unit coverage:

- API base URL resolution.
- Error code to user message mapping.
- Ticket total calculation.
- Countdown expiration calculation.
- Reservation state transitions.

When real UI components are implemented, add Testing Library coverage for:

- Seat state rendering.
- Seat selection interactions.
- Form validation display.
- Order summary updates.

### 11.2 Integration Tests

Required integration coverage:

- Home -> movie detail -> seat selection -> ticket types -> checkout -> confirmation using mocked API.
- Login and redirect back to the originally requested route.
- Reservation expiration reset.
- Failed reservation lock handling.

### 11.3 End-to-End Tests

When Playwright or Cypress is added, required E2E scenarios:

- Register -> log in -> purchase ticket.
- Attempt to reserve an already reserved seat.
- Visit protected route while unauthenticated.
- Let a reservation expire and verify reset behavior.

### 11.4 CI Requirements

The frontend CI workflow must run:

1. `npm ci`
2. `npm run lint`
3. `npm run test`
4. `npx playwright install --with-deps chromium`
5. `npm run e2e:ci`
6. `npm run build`

---

## 12. Operational Requirements

### 12.1 Environment Variables

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Backend REST API base URL compiled into browser code at build time | `http://localhost:8000` |

### 12.2 Local Commands

```bash
cd frontend
npm ci
npm run dev
npm run lint
npm run test
npm run e2e:ci
npm run build
```

The development server runs on `http://localhost:3000`.

### 12.3 Docker and Deployment

- The default frontend Dockerfile is production-oriented, multi-stage, installs with `npm ci`, runs `npm run build`, and uses a minimal Next.js standalone runtime.
- The root `docker-compose.yml` keeps local development on `Dockerfile.dev`, mounts the frontend directory, and injects `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`.
- Production Docker builds must pass `NEXT_PUBLIC_API_BASE_URL` as a build argument because public Next.js variables are compiled into browser assets.
- The production container starts with the Next.js standalone runtime command `node server.js`.
- Static CDN or Nginx-only hosting should be used only if the project is explicitly configured for static export.

---

## 13. Requirements Traceability Matrix

| Requirement | Frontend Artifact |
|---|---|
| FE-01 Home Page | `src/app/page.tsx`, `src/components/movies/FeaturedBanner`, `src/components/movies/MovieGrid`, `src/api/catalog.ts` |
| FE-02 Movie Detail | `src/app/movies/[movieId]/page.tsx`, `src/components/movies/SessionPicker`, `src/components/movies/DateSelector` |
| FE-03 Seat Selection | `src/app/sessions/[sessionId]/seats/page.tsx`, `src/components/seats/SeatMap`, `src/components/seats/SeatCell`, `src/components/seats/CountdownTimer`, `src/api/reservation.ts` |
| FE-04 Ticket Type Selection | `src/app/ticket-types/page.tsx`, `src/components/checkout/TicketTypeSelector`, `src/components/checkout/OrderSummaryPanel` |
| FE-05 Checkout | `src/app/checkout/page.tsx`, `src/components/checkout/PaymentMethodSelector`, `src/api/checkout.ts` |
| FE-06 Confirmation and My Tickets | `src/app/confirmation/page.tsx`, `src/app/my-tickets/page.tsx`, `src/components/tickets/TicketCard` |
| FE-07 Authentication | `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/api/auth.ts`, `src/hooks/useAuth.ts`, `src/contexts/AuthContext.tsx` |
| Accessibility | `src/components/seats/SeatMap`, `src/components/seats/SeatLegend`, all forms |
| Reservation Expiration | `src/hooks/useCountdown.ts`, `src/contexts/ReservationContext.tsx` |
| Client Security | `src/api/client.ts`, `src/contexts/AuthContext.tsx` |
| Reservation Conflict | `src/components/seats/SeatMap`, `src/components/ui/ErrorToast` |
| Route Guards | `src/components/layout/AuthGuard.tsx` or equivalent client-side guard |

---

## 14. Out of Scope

- Real payment gateway processing.
- Native iOS or Android applications.
- Admin catalog management UI.
- Loyalty program, cashback, or real coupon validation.
- Concession ordering.
- Real QR code validation at physical entrance.
- Backend model changes.
- Server-side rendering requirements beyond what the current Next.js app naturally supports.
