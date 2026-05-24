# Cinepolis Natal — Product Requirements Document (Full-Stack)

## Software Requirements Specification & Frontend Specification

**Project:** cinepolis-natal  
**Document type:** Product Requirements Document (PRD) — Full-Stack  
**Version:** 2.0  
**Last update:** 2026-05-13  
**Previous version:** SRS v1.0 (Backend-only, 2026-03-22)

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [System Context](#2-system-context)
3. [Architecture Overview](#3-architecture-overview)
4. [Functional Requirements — Backend](#4-functional-requirements--backend)
5. [Functional Requirements — Frontend](#5-functional-requirements--frontend)
6. [Use Cases (1–10)](#6-use-cases-110)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Data Model and Integrity Rules](#8-data-model-and-integrity-rules)
9. [API Contract and Error Standard](#9-api-contract-and-error-standard)
10. [Frontend Component Specification](#10-frontend-component-specification)
11. [Security and Access Control](#11-security-and-access-control)
12. [Operational Requirements](#12-operational-requirements)
13. [Requirements Traceability Matrix](#13-requirements-traceability-matrix)
14. [Out of Scope](#14-out-of-scope)

---

## 1. Purpose and Scope

The Cinepolis Natal platform is a full-stack cinema reservation system composed of a production-oriented REST backend (Django/DRF) and a browser-based frontend application.

**Scope covered by this document:**

Backend (carried over from SRS v1.0, with amendments):
- User registration and JWT authentication
- Public catalog browsing (genres, movies, rooms, sessions)
- Session seat map inspection
- Temporary seat reservation with distributed lock and expiration
- Checkout with ticket-type pricing and payment-method selection
- Ticket generation and authenticated ticket listing
- Standardized API error responses, rate limiting, health checks, background processing, and CI validation

Frontend (new in v2.0):
- Home page with featured film banner and categorized movie listings
- Movie detail and session selection page
- Interactive seat map with real-time lock feedback
- Ticket-type selection with dynamic subtotal calculation
- Checkout and payment flow with order summary
- Post-purchase ticket confirmation screen

---

## 2. System Context

### 2.1 Business Context

The platform supports the complete online reservation workflow: browsing the catalog, selecting a session and seats, choosing ticket types, paying, and receiving purchase confirmation — all accessible from a web browser without requiring a native application.

### 2.2 Actors

| Actor | Description | Capabilities |
|---|---|---|
| Visitor | Unauthenticated user | Browse home, catalog, movie details, session seat maps; register; login |
| Authenticated User | User with valid JWT access token | All visitor capabilities plus: temporary reservation, checkout, view own tickets, view own profile |

---

## 3. Architecture Overview

### 3.1 Architectural Style

- **Backend:** Modular monolith — Django and Django REST Framework
- **Frontend:** Single-page application (SPA) consuming the REST API

### 3.2 Core Backend Components

- **API layer:** DRF views and serializers
- **Domain/data layer:** Django ORM models with relational constraints
- **Service layer:** reservation, checkout, expiration, and pricing services
- **Infrastructure:** PostgreSQL, Redis, Celery worker

### 3.3 Frontend Stack

- Browser-based SPA (framework choice: React or equivalent)
- Communicates exclusively with the REST API via HTTP(S)
- No server-side rendering required; static asset delivery via CDN or web server

### 3.4 Redis Responsibilities

- List caching for catalog endpoints
- Distributed seat locking: `lock:session-seat:{session_id}:{seat_id}`

### 3.5 Celery Responsibilities

- Release expired temporary reservations
- Send ticket confirmation emails asynchronously

### 3.6 Error Handling Model

- Centralized exception handler on the backend
- Consistent error envelope across all API endpoints
- Frontend interprets error codes to display user-facing messages

---

## 4. Functional Requirements — Backend

### FR-01 User Registration

The system shall allow account creation with `email`, `username`, and `password`.

### FR-02 User Login

The system shall authenticate users using email/password and issue JWT access and refresh tokens.

### FR-03 Current User Data

The system shall expose an authenticated endpoint to retrieve the current user profile.

### FR-04 Catalog Endpoints

The system shall provide endpoints for genres, movies, rooms, and sessions with public list/retrieve operations and admin-only create/update/delete operations.

### FR-04a Movie Status and Featured Flag

The Movie model shall include a `status` field (enumeration: `em_cartaz`, `pre_venda`) to support frontend catalog filtering. It shall also include an `is_featured` boolean field to designate films for the home page banner. The catalog list endpoint shall accept a `status` query parameter for filtering and shall include `is_featured` in its response payload.

### FR-05 Seat Map Visualization

The system shall provide public session seat maps with per-seat status (`AVAILABLE`, `RESERVED`, `PURCHASED`).

### FR-06 Temporary Reservation

The system shall allow authenticated users to temporarily reserve session seats, enforcing seat availability and ownership metadata via a distributed Redis lock.

### FR-07 Reservation Expiration

The system shall expire temporary seat reservations after 600 seconds and restore seat availability when expired.

### FR-08 Checkout with Ticket Type and Payment Method

The system shall finalize valid reserved seats into purchased seats in a transactional operation and generate tickets. The checkout payload shall accept, for each reserved seat, a `ticket_type` value (`inteira` or `meia`) and shall accept a `payment_method` field (`cartao_credito` or `pix`) at the order level. The service layer shall calculate the total amount based on each seat's applicable `base_price` and `ticket_type` (where `meia` = 50% of `base_price`) and validate that the submitted total matches the computed total before committing the transaction.

### FR-08a Session Base Price

Each `Session` record shall carry a `base_price` field (decimal) representing the full ticket price for that session. This value is used by the checkout service to compute per-seat amounts.

### FR-09 My Tickets

The system shall allow authenticated users to list their own tickets, with optional `type=upcoming|past` filtering. Each ticket record shall include the `ticket_type` and `amount_paid` associated with the purchase.

### FR-10 API Documentation Endpoints

The system shall expose OpenAPI schema and Swagger UI.

### FR-11 Health Check

The system shall expose a health endpoint verifying database, Redis, and Celery connectivity.

---

## 5. Functional Requirements — Frontend

### FE-01 Home Page

The home page shall display a featured-film banner driven by movies where `is_featured = true`. Below the banner, the page shall present two categorized sections — "Em Cartaz" and "Pré-venda" — populated by filtering the catalog by `status`. Each film card shall display the movie poster and title and shall navigate to the movie detail page on interaction.

### FE-02 Movie Detail and Session Selection Page

The movie detail page shall display the film's synopsis, genre(s), age rating, and duration. It shall present a date picker allowing the user to select a viewing date and, upon date selection, render the available sessions for that date grouped by room type and audio format (e.g., Sala Tradicional Legendado, VIP Dublado). Selecting a session shall navigate the user to the seat selection page for that session.

### FE-03 Seat Selection Page

The seat selection page shall render an interactive visual map of the session's room. The map shall display a "TELA" (screen) indicator at the top and each seat as a selectable element positioned according to its row and number. Seat states shall be visually distinguished: Available (white/outline), Selected (filled highlight color), Occupied (grey), and Accessible/Wheelchair (distinct marker). Clicking an available seat shall call the temporary reservation endpoint; the seat state shall update optimistically and revert if the lock fails. A countdown timer shall display the remaining reservation window (600 s). A summary panel shall show the selected seats and current total. Clicking a selected seat shall release the reservation and restore the seat to Available.

### FE-04 Ticket Type Selection Page

After confirming seat selection, the user shall proceed to the ticket-type page. For each selected seat, the user shall choose a ticket type: Inteira (full price) or Meia-entrada (50% of base price). The page shall display the per-seat price based on the selection and recalculate the order subtotal in real time as types are changed. A voucher/coupon code input field shall be present.

### FE-05 Checkout and Payment Page

The checkout page shall present an order summary (movie title, session date/time, room, selected seats with ticket types, and total amount). The user shall select a payment method (Cartão de Crédito or PIX). Upon confirmation, the page shall submit the checkout payload to the API. While the request is in-flight, the UI shall display a loading indicator. On success, the user shall be redirected to the confirmation page. On failure, an appropriate error message derived from the API error code shall be displayed.

### FE-06 Order Confirmation and My Tickets

Upon successful checkout, the user shall be presented with a confirmation screen displaying each purchased ticket. Each ticket shall show: movie title, session date/time, room, seat identifier, ticket type, amount paid, and a generated QR code or barcode representation (fictitious/display-only in this scope). A "Meus Ingressos" section accessible from the authenticated user's navigation shall display all past and upcoming tickets, filterable by `upcoming` or `past`.

### FE-07 Authentication Flow (Register / Login)

The frontend shall provide registration and login forms. On successful login, JWT tokens shall be stored in memory (or `httpOnly` cookies if supported) and attached to subsequent API requests as Bearer tokens. On token expiry, the user shall be redirected to the login page. Protected routes (checkout, my tickets) shall be inaccessible to unauthenticated visitors.

---

## 6. Use Cases (1–10)

### UC-1 Register User

**Actor:** Visitor  
**Precondition:** none  
**Main flow:** submit registration payload (username, email, password); system validates and creates user account.  
**Result:** user account created; user may log in.

### UC-2 Login User

**Actor:** Visitor  
**Precondition:** registered account exists  
**Main flow:** submit credentials; system authenticates and returns JWT tokens; frontend stores tokens.  
**Result:** user can access protected pages and endpoints.

### UC-3 Browse Home Page

**Actor:** Visitor or Authenticated User  
**Main flow:** load home page; frontend fetches featured movies (`is_featured=true`) for the banner and fetches `em_cartaz` and `pre_venda` catalog sections; results are displayed.

### UC-4 View Movie Detail and Select Session

**Actor:** Visitor or Authenticated User  
**Main flow:** navigate to movie detail; frontend fetches movie metadata and available sessions; user selects a date and session.

### UC-5 View Session Seat Map and Reserve Seats

**Actor:** Authenticated User  
**Precondition:** session selected  
**Main flow:** frontend fetches seat map for the session; user clicks available seats; frontend calls temporary reservation endpoint for each seat; countdown timer starts.  
**Alternative:** seat lock fails (already reserved by another user) — UI displays error and reverts seat to available.

### UC-6 Select Ticket Types

**Actor:** Authenticated User  
**Precondition:** at least one seat temporarily reserved  
**Main flow:** user selects a ticket type (inteira/meia) per reserved seat; frontend displays real-time subtotal.

### UC-7 Checkout

**Actor:** Authenticated User  
**Precondition:** seats reserved and ticket types selected  
**Main flow:** user reviews order summary; selects payment method; confirms checkout; frontend submits payload to checkout endpoint; backend validates amounts and marks seats purchased.  
**Result:** tickets created; user redirected to confirmation page.

### UC-8 View Confirmation and My Tickets

**Actor:** Authenticated User  
**Precondition:** successful checkout  
**Main flow:** confirmation screen displays generated tickets with QR representation; user can access "Meus Ingressos" to view all tickets filtered by upcoming/past.

### UC-9 Reservation Expiration

**Actor:** System (Celery)  
**Precondition:** temporary reservation older than 600 s without checkout  
**Main flow:** Celery task fires; seat status restored to AVAILABLE; Redis lock released.  
**Result:** seat becomes available to other users; frontend timer expiry prompts user to restart.

### UC-10 Browse Catalog Without Authentication

**Actor:** Visitor  
**Main flow:** visitor accesses home, movie detail, and seat map pages without logging in; all read-only catalog and seat-map endpoints are public.  
**Result:** visitor can explore the catalog; attempting to reserve seats redirects to login.

---

## 7. Non-Functional Requirements

### NFR-01 Performance and Response Behavior

- All list endpoints are paginated.
- Movies and sessions list endpoints use Redis-backed caching.
- Frontend shall display skeleton loaders or spinners while API requests are in-flight.
- Time-to-interactive for the home page shall not exceed 3 s on a standard broadband connection.

### NFR-02 Concurrency and Consistency

- Distributed Redis lock prevents competing seat reservation attempts.
- Checkout runs inside a DB transaction.
- Seat status transitions are validated and persisted consistently.
- Total amount validation in checkout prevents price manipulation from the client.

### NFR-03 Reliability

- Expiration and email tasks are executed asynchronously via Celery.
- Email task has retry behavior for transient failures.
- Frontend countdown timer aligns with server-side expiration to minimize UX surprises.

### NFR-04 Security

- JWT Bearer authentication for all protected operations.
- Password validation enforced in the registration serializer.
- Access control via DRF permissions on the backend.
- Frontend never stores tokens in `localStorage`; prefer memory or `httpOnly` cookies.
- Checkout total is validated server-side; client-submitted totals are not trusted.

### NFR-05 Abuse Protection

- Global anonymous and authenticated throttles on the backend.
- Endpoint-specific throttles for login and reservation operations.

### NFR-06 Operability

- Structured logging on the backend.
- Correlation ID middleware for request tracing.
- Health check endpoint for infrastructure monitoring.

### NFR-07 Accessibility

- Seat map must visually and semantically distinguish wheelchair-accessible seats.
- Interactive seat elements must be keyboard-navigable and carry appropriate ARIA roles.
- Color-based status indicators must include a text/icon alternative (legend).

### NFR-08 Testability

- Backend: automated integration test suite covering core business flows and error contracts.
- Frontend: component-level and end-to-end tests covering the reservation and checkout flows.

---

## 8. Data Model and Integrity Rules

### 8.1 Primary Entities

- `User`
- `Genre`
- `Movie` *(amended)*
- `Room`
- `Session` *(amended)*
- `SeatRow`
- `Seat`
- `SessionSeat`
- `Ticket` *(amended)*

### 8.2 Model Amendments

#### Movie (amended)

| Field | Type | Notes |
|---|---|---|
| `status` | CharField (enum) | `em_cartaz` \| `pre_venda`; default `em_cartaz` |
| `is_featured` | BooleanField | `default=False`; controls banner placement on home page |

#### Session (amended)

| Field | Type | Notes |
|---|---|---|
| `base_price` | DecimalField | Full-price ticket value for this session; required |

#### Ticket (amended)

| Field | Type | Notes |
|---|---|---|
| `ticket_type` | CharField (enum) | `inteira` \| `meia`; required at checkout |
| `amount_paid` | DecimalField | Actual amount charged (after ticket-type discount) |
| `payment_method` | CharField (enum) | `cartao_credito` \| `pix`; stored at ticket level |

### 8.3 Key Integrity Rules

- Unique movie constraint: `(title, release_date)`
- Room capacity and movie duration check constraints
- No overlapping sessions in the same room (DB exclusion constraint + model validation)
- Unique seat coordinates (`row`, `number`) and unique seat per session
- `SessionSeat` validation across status/lock fields
- `Ticket` only for a purchased seat (`OneToOne` with `SessionSeat`)
- `amount_paid` must equal `base_price` (if `inteira`) or `base_price × 0.5` (if `meia`), validated in `CheckoutService`

---

## 9. API Contract and Error Standard

### 9.1 API Endpoints

Support and documentation:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health/` | Health check for database, Redis, and Celery connectivity |
| `GET` | `/api/schema/` | OpenAPI schema |
| `GET` | `/api/docs/` | Swagger UI |

Authentication and user endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register/` | Register a user |
| `POST` | `/api/v1/auth/login/` | Authenticate and issue access and refresh tokens |
| `POST` | `/api/v1/auth/token/refresh/` | Refresh an access token from a valid refresh token |
| `GET` | `/api/v1/users/me/` | Return current authenticated user profile |
| `GET` | `/api/v1/users/me/tickets/` | Return authenticated user's tickets |

Catalog endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `GET`, `POST` | `/api/v1/catalog/genres/` | List or create genres |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/catalog/genres/{genre_id}/` | Retrieve, update, or delete a genre |
| `GET`, `POST` | `/api/v1/catalog/movies/` | List or create movies |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/catalog/movies/{movie_id}/` | Retrieve, update, or delete a movie |
| `GET`, `POST` | `/api/v1/catalog/rooms/` | List or create rooms |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/catalog/rooms/{room_id}/` | Retrieve, update, or delete a room |
| `GET`, `POST` | `/api/v1/catalog/sessions/` | List or create sessions |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/catalog/sessions/{session_id}/` | Retrieve, update, or delete a session |

Reservation endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `GET`, `POST` | `/api/v1/reservation/seat-rows/` | List or create seat rows |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/reservation/seat-rows/{seat_row_id}/` | Retrieve, update, or delete a seat row |
| `GET`, `POST` | `/api/v1/reservation/seats/` | List or create seats |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/reservation/seats/{seat_id}/` | Retrieve, update, or delete a seat |
| `GET`, `POST` | `/api/v1/reservation/session-seats/` | List or create session seats |
| `GET`, `DELETE` | `/api/v1/reservation/session-seats/{session_seat_id}/` | Retrieve or delete a session seat |
| `GET`, `POST` | `/api/v1/reservation/tickets/` | List or create tickets |
| `GET`, `DELETE` | `/api/v1/reservation/tickets/{ticket_id}/` | Retrieve or delete a ticket |
| `GET` | `/api/v1/reservation/sessions/{session_id}/seats/` | Return the seat map for a session |
| `POST`, `DELETE` | `/api/v1/reservation/sessions/{session_id}/reservations/` | Create or release temporary reservations |
| `POST` | `/api/v1/reservation/checkout/` | Finalize checkout for temporarily reserved seats |

Authentication routes and user-profile routes are intentionally split. Duplicated
wrong-prefix aliases such as `/api/v1/users/login/` and `/api/v1/auth/me/`
return `404` and are not documented in OpenAPI.

### 9.1.1 Room, Seat, and Session Consistency Rules

- `Room.capacity` is a declarative maximum for the room layout. The registered
  `Seat` count for a room cannot exceed `capacity`, and `capacity` cannot be
  reduced below the number of registered seats.
- Creating a `Session` through the API generates one `SessionSeat` for each
  registered seat in the room at creation time.
- Room seat layout changes are blocked while future sessions exist for that
  room. This prevents future session seat maps from becoming silently incomplete
  after sessions have been published.
- Existing sessions cannot change `movie`, `room`, `start_time`, `end_time`, or
  `base_price` after any seat in the session is reserved or purchased.

### 9.2 Catalog Query Parameters (amended)

`GET /api/v1/catalog/movies/` shall support:

| Parameter | Type | Description |
|---|---|---|
| `status` | string | Filter by `em_cartaz` or `pre_venda` |
| `is_featured` | boolean | Filter featured movies for the home banner |

### 9.3 Checkout Payload (amended)

```json
{
  "seats": [
    {
      "session_seat_id": 42,
      "ticket_type": "inteira"
    },
    {
      "session_seat_id": 43,
      "ticket_type": "meia"
    }
  ],
  "payment_method": "pix"
}
```

The backend shall:
1. Verify all `session_seat_id` values are in `RESERVED` status and belong to the requesting user.
2. Compute expected total from each seat's session `base_price` and submitted `ticket_type`.
3. Persist `ticket_type`, `amount_paid`, and `payment_method` on each generated `Ticket` record.
4. Mark each `SessionSeat` as `PURCHASED` and release the Redis lock within a single DB transaction.

### 9.4 Standardized Error Payload

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "status": 400,
    "details": {}
  }
}
```

Error codes in active use:

| Code | HTTP Status | Trigger |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Request payload invalid |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `NOT_AUTHENTICATED` | 401 | Missing or expired JWT |
| `PERMISSION_DENIED` | 403 | Insufficient permissions |
| `RESOURCE_NOT_FOUND` | 404 | Entity does not exist |
| `SEAT_ALREADY_RESERVED` | 409 | Concurrent reservation conflict |
| `INVALID_TICKET_TYPE` | 400 | Unrecognized `ticket_type` value |
| `INVALID_PAYMENT_METHOD` | 400 | Unrecognized `payment_method` value |
| `THROTTLED` | 429 | Rate limit exceeded |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled server error |

---

## 10. Frontend Component Specification

### 10.1 Page Inventory

| Page | Route (suggested) | Auth Required |
|---|---|---|
| Home | `/` | No |
| Movie Detail | `/movies/{id}` | No |
| Seat Selection | `/sessions/{id}/seats` | Yes |
| Ticket Type Selection | `/sessions/{id}/ticket-types` | Yes |
| Checkout | `/checkout` | Yes |
| Order Confirmation | `/confirmation/{order_id}` | Yes |
| My Tickets | `/me/tickets` | Yes |
| Login | `/login` | No |
| Register | `/register` | No |

### 10.2 Shared UI Components

- **Navigation bar:** logo, primary nav links (Programação, Bomboniére, Salas Especiais, Promoções), and authenticated-user menu (Meus Ingressos, Sair).
- **Movie card:** poster image, title, rating badge, duration.
- **Countdown timer:** real-time display of remaining reservation window; triggers expiry warning at 60 s remaining.
- **Order summary panel:** persistent sidebar or bottom sheet visible during seat selection, ticket-type, and checkout steps displaying selected seats, types, and running total.
- **Error toast / alert:** maps API `error.code` to user-friendly Portuguese message.

### 10.3 Seat Map Rendering

The seat map is a grid derived from the `SessionSeat` list returned by `GET /api/v1/reservation/sessions/{session_id}/seats/`. Rendering rules:

- Rows are labeled alphabetically (A, B, C…) on both sides of the grid.
- Seats within a row are numbered and rendered as adjacent pairs (sofa/loveseat layout) with a visual gap at the center aisle.
- A blue curved "TELA" banner is rendered above row A.
- "FUNDO DA SALA" label is rendered below the last row.
- Seat states map to CSS classes:

| API Status | Visual State | Color/Style |
|---|---|---|
| `AVAILABLE` | Selectable | White background, dark border |
| `RESERVED` (by current user) | Selected | Brand highlight (e.g., green) |
| `RESERVED` (by another user) | Occupied | Grey, non-interactive |
| `PURCHASED` | Occupied | Grey, non-interactive |
| Accessible seat | Accessible | Standard color + wheelchair icon |

### 10.4 State Management

- Seat selections and reservation state are held in client memory during the reservation flow.
- JWT access token is held in memory and refreshed using the refresh token prior to expiry.
- On countdown expiry, client state is reset and the user is redirected to the session list with an explanatory message.

---

## 11. Security and Access Control

- JWT Bearer authentication is the default API auth mechanism.
- Catalog read and health endpoints are public.
- Catalog mutation operations require admin permissions.
- Reservation admin resources require admin permissions; user-facing reservation, checkout, current-user, and my-ticket endpoints require authentication.
- Login and reservation endpoints have dedicated throttle scopes.
- The checkout service validates computed totals server-side; the frontend-submitted total is never blindly trusted.
- Frontend routes requiring authentication redirect unauthenticated users to `/login`, preserving the originally requested path for post-login redirect.

---

## 12. Operational Requirements

### 12.1 Deployment / Runtime

- Docker Compose stack includes: `web`, `db`, `redis`, `celery`, and optionally `frontend` services.
- Environment variables control DB connection, Redis, JWT lifetimes, throttling, email, logging behavior, and frontend API base URL.
- The frontend production deployment uses a Next.js-compatible runtime container unless the app is explicitly configured and validated for static export.

### 12.2 CI Requirements

GitHub Actions pipeline validates:
- Backend: dependency installation via Poetry, Django system check, migrations, test suite execution
- Frontend: dependency installation, linting, unit/integration tests, Playwright E2E tests, and production build
- Docker Compose configuration validation
- Docker image build (both backend and frontend images)

---

## 13. Requirements Traceability Matrix

| Requirement | Implementation Artifact |
|---|---|
| FR-01 | `users.views.UserRegistrationView`, `users.serializers.UserRegistrationSerializer` |
| FR-02 | `users.views.UserLoginView`, `users.serializers.UserLoginSerializer` |
| FR-03 | `users.views.CurrentUserView` |
| FR-04 | `catalog.views.*`, `catalog.urls` |
| FR-04a | `catalog.models.Movie` (`status`, `is_featured`), `catalog.serializers.MovieSerializer`, `catalog.views.MovieListView` |
| FR-05 | `reservations.views.SessionSeatMapView` |
| FR-06 | `reservations.views.TemporarySeatReservationView`, `reservations.services.TemporaryReservationService` |
| FR-07 | `reservations.tasks.release_expired_session_seat`, `reservations.services.ExpiredSeatReleaseService` |
| FR-08 | `reservations.views.CheckoutView`, `reservations.services.CheckoutService`, `reservations.models.Ticket` |
| FR-08a | `catalog.models.Session` (`base_price`), `reservations.services.CheckoutService` (pricing logic) |
| FR-09 | `users.views.MyTicketsView` |
| FR-10 | `cinepolis_natal_api.urls` (`/api/schema/`, `/api/docs/`) |
| FR-11 | `cinepolis_natal_api.health.HealthCheckService`, `/health/` |
| FE-01 | `pages/HomePage`, `components/FeaturedBanner`, `components/MovieGrid` |
| FE-02 | `pages/MovieDetailPage`, `components/SessionPicker`, `components/DateSelector` |
| FE-03 | `pages/SeatSelectionPage`, `components/SeatMap`, `components/CountdownTimer` |
| FE-04 | `pages/TicketTypePage`, `components/TicketTypeSelector`, `components/OrderSummaryPanel` |
| FE-05 | `pages/CheckoutPage`, `components/PaymentMethodSelector`, `services/checkoutApi` |
| FE-06 | `pages/ConfirmationPage`, `pages/MyTicketsPage`, `components/TicketCard` |
| FE-07 | `pages/LoginPage`, `pages/RegisterPage`, `services/authApi`, `hooks/useAuth` |

---

## 14. Out of Scope

Not implemented in this project scope:
- Real payment gateway processing (Stripe, PagSeguro, Mercado Pago, etc.)
- Native mobile applications (iOS / Android)
- Seat and row CRUD API endpoints
- Role-based administration workflows beyond Django admin
- Club Cinépolis membership management, cashback, or discount processing beyond the voucher code input field
- Concession / bomboniére ordering
- Real QR code validation at the physical entrance
