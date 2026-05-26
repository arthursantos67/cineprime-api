# CinePrime Backend

Production-oriented REST API for a movie ticket reservation system. The platform allows users to register, authenticate with JWT, browse movie sessions, inspect real-time seat availability, reserve seats temporarily with distributed locking, complete checkout, and access personal tickets.

## Project Overview

This project represents the backend for a cinema reservation workflow where ticket purchase must remain consistent under concurrent access.

Business context:
- Public users browse catalog data (movies, sessions, rooms, genres, seat map).
- Authenticated users reserve seats temporarily and complete checkout.
- The system protects seat integrity with Redis locking, database constraints, and transactional flows.
- Ticket confirmation is processed asynchronously by Celery.

These capabilities are implemented with emphasis on data consistency, concurrency safety, and production-readiness.

## Documentation

Detailed full-stack requirements are available in [`product-requirements-document.md`](../product-requirements-document.md).

## Tech Stack

- Python 3.14
- Django 6 + Django REST Framework
- JWT auth via `djangorestframework-simplejwt`
- PostgreSQL 17
- Redis 7 (`django-redis` cache + distributed locks)
- Celery (Redis broker)
- OpenAPI/Swagger via `drf-spectacular`
- Docker + Docker Compose
- GitHub Actions CI
- Pytest + pytest-django

## Features and Requirements Mapping

The table below maps implemented requirements to concrete endpoints/components.

| Requirement | Implemented behavior | Where in implementation |
| --- | --- | --- |
| User registration | Register with email, username, password | `POST /api/v1/auth/register/` (`users.views.UserRegistrationView`) |
| JWT login | Login returns access + refresh tokens | `POST /api/v1/auth/login/` (`users.views.UserLoginView`) |
| JWT refresh | Refresh token returns a new access token | `POST /api/v1/auth/token/refresh/` (`users.views.UserTokenRefreshView`) |
| Current user profile | Returns authenticated user identity | `GET /api/v1/users/me/` |
| Public catalog | Public list/retrieve for genres, movies, rooms, sessions; admin-only catalog mutations | `catalog.views.*` under `/api/v1/catalog/*` |
| Reservation admin entities | Admin-only full CRUD for seat rows and seats; admin-only list/create/retrieve/delete for session seats; admin-only list/retrieve/delete for tickets | `reservations.views.*` under `/api/v1/reservation/*` |
| Session seat map | Public seat status (`AVAILABLE`, `RESERVED`, `PURCHASED`) | `GET /api/v1/reservation/sessions/{session_id}/seats/` |
| Temporary reservation | Authenticated seat lock with expiration metadata | `POST /api/v1/reservation/sessions/{session_id}/reservations/` |
| Checkout | Transactional purchase and ticket creation | `POST /api/v1/reservation/checkout/` + `reservations.services.checkout_service` |
| My tickets | Authenticated ticket list + `type=upcoming|past` filter | `GET /api/v1/users/me/tickets/` |
| Standardized errors | Unified error envelope for 4xx/5xx | `cineprime_api.exception_handler.standardized_exception_handler` |
| Rate limiting | Global + login + reservation throttles | `cineprime_api.throttling` + DRF settings |
| Redis cache | Caching for movies/sessions list endpoints + invalidation on create/update/delete | `catalog.views.MovieListCreateView` / `SessionListCreateView` |
| Async jobs | Expiration release + ticket email notification | `reservations.tasks` + Celery worker |
| Health check | Liveness, readiness, and deep dependency health status | `GET /health/live/`, `GET /health/ready/`, `GET /health/deep/` |
| API docs | OpenAPI schema + Swagger UI | `/api/schema/`, `/api/docs/` |

### Use Cases (1–7)

1. **User Registration**: create account with unique email and username.
2. **User Login**: authenticate and receive JWT tokens.
3. **Browse Movies**: list available movies and metadata.
4. **Browse Sessions**: list available sessions with movie + room data.
5. **View Seat Map**: inspect seat availability by session.
6. **Reserve + Checkout**: temporarily reserve seats, then finalize purchase.
7. **View My Tickets**: retrieve authenticated user ticket history (upcoming/past).

## Architecture Overview

### High-level design

- **Presentation layer**: DRF views/serializers expose HTTP API.
- **Domain/data layer**: Django models with relational and integrity constraints.
- **Service layer**: reservation/checkout/expiration services encapsulate transactional business logic.
- **Infrastructure**:
	- PostgreSQL as source of truth
	- Redis for cache and lock keys
	- Celery worker for asynchronous operations

### Architectural decisions

- **Modular monolith**: chosen to keep domain boundaries explicit while preserving deployment simplicity and transactional consistency.
- **Redis**: used for two latency/consistency-critical concerns, catalog caching and distributed seat locks.
- **Celery**: used to offload non-request-bound work (reservation expiration and ticket confirmation email).
- **Centralized error handler**: used to enforce a stable API contract and consistent observability across all endpoints.

### Redis locking strategy

- Lock key format: `lock:session-seat:{session_id}:{seat_id}`.
- Lock acquisition uses `cache.add` (atomic set-if-not-exists semantics).
- Temporary reservation duration: 600 seconds.
- Locks are released on checkout completion or expiration task execution.

### Celery async flows

- `release_expired_session_seat(session_seat_id)`:
	- runs at reservation expiration time
	- turns expired reserved seats back to `AVAILABLE`
	- releases Redis lock
- `send_ticket_confirmation_email_task(user_id, ticket_ids)`:
	- executed after successful checkout
	- has retry strategy for transient SMTP/network failures
	- includes idempotency guard via Redis cache fingerprint

### Error handling approach

- A centralized DRF exception handler returns a consistent `error` envelope.
- Handles validation/auth/permission/not-found/conflict/throttle/internal errors consistently.
- Internal exceptions are logged with contextual metadata while returning sanitized 500 responses.

### Health check policy

- `GET /health/live/`: process liveness only. Returns 200 when the HTTP process can respond.
- `GET /health/ready/`: readiness for core API dependencies. Checks database and Redis and returns 503 if either is unavailable.
- `GET /health/deep/`: full dependency status for database, Redis, and Celery worker inspection. Returns 503 when any deep dependency is unavailable.
- `GET /health/`: compatibility alias for readiness. Celery inspect failures do not make the HTTP API unavailable unless callers explicitly use `/health/deep/`.

### Throttling policy

- Global anonymous and authenticated request throttles use DRF's default IP/user behavior.
- Login throttling uses the client IP plus a SHA-256 fingerprint of the normalized submitted email. This keeps responses independent of account existence, avoids storing raw emails in cache keys, and prevents one attempted email from consuming the whole IP login budget.
- Reservation throttling uses the authenticated user id for authenticated reservation and checkout requests. Anonymous reservation attempts fall back to client IP, although reservation endpoints still require authentication.

### Scalability considerations already implemented

- Stateless JWT authentication.
- Pagination (`PageNumberPagination`, page size 10).
- Redis caching for high-read catalog list endpoints.
- Redis-based distributed seat locking for concurrent reservation attempts.
- Background task offloading via Celery.
- Rate limiting scopes: `anon`, `user`, `login`, `reservation`.


## Setup Instructions

The Django application lives in `backend/`, but the supported local development flow is Docker-based from the repository root. The backend image installs Python dependencies during the Docker build, so contributors should not run Poetry directly on the host machine.

> Run backend commands inside Docker only. Use `docker compose exec backend ...`
> or `docker compose run --rm backend ...`; do not use `poetry run` on the host.

```bash
cp .env.example .env
docker compose up --build
```

This provisions the backend API, frontend dev server, PostgreSQL, Redis, and
Celery worker. The backend runs Django migrations during container startup before
serving requests, then remains available at `http://localhost:8000`.

Common backend commands:

```bash
docker compose exec backend python manage.py check
docker compose exec backend python manage.py migrate
docker compose exec backend pytest -q
docker compose exec celery celery -A cineprime_api inspect ping
```

---

## Environment Variables

### Core

- `DJANGO_ENV`: runtime environment. Use `development` locally and `production` in deployed environments.
- `SECRET_KEY`: Django secret key. Local development may use the example value from `.env.example`; production must provide a unique secret and cannot use `unsafe-secret-key`, `change-me`, or `changeme`.
- `DEBUG`: `True` or `False`. The settings default to `False`; local development should set `DEBUG=True` in `.env`.
- `ALLOWED_HOSTS`: comma-separated host list. Local development uses `127.0.0.1,localhost`; production must define explicit public API hosts.
- `CORS_ALLOWED_ORIGINS`: comma-separated frontend origins allowed to call the API. Local development uses `http://localhost:3000`; production must define explicit HTTPS frontend origins.

### Production Safety

When `DJANGO_ENV=production`, settings validation fails fast during Django startup if any unsafe configuration is detected:

- `SECRET_KEY` is missing or uses a known development value.
- `DEBUG=True`.
- `ALLOWED_HOSTS` is empty, missing, uses localhost/loopback, or contains `*` without `ALLOW_WILDCARD_PRODUCTION_HOSTS=True`.
- `CORS_ALLOWED_ORIGINS` is empty, missing, uses localhost/loopback, contains wildcards, or uses non-HTTPS origins without `ALLOW_INSECURE_PRODUCTION_CORS_ORIGINS=True`.

Recommended production core values:

```env
DJANGO_ENV=production
DEBUG=False
SECRET_KEY=<generate-a-long-random-secret>
ALLOWED_HOSTS=api.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
```

Production security headers default to safe values when `DJANGO_ENV=production`:

- `SECURE_SSL_REDIRECT=True`
- `SESSION_COOKIE_SECURE=True`
- `CSRF_COOKIE_SECURE=True`
- `SECURE_HSTS_SECONDS=31536000`
- `SECURE_HSTS_INCLUDE_SUBDOMAINS=True`
- `SECURE_HSTS_PRELOAD=True`
- `SECURE_REFERRER_POLICY=strict-origin-when-cross-origin`

Set these explicitly only when your deployment topology requires a different value. For example, if TLS terminates at a proxy, make sure the proxy forwards HTTPS correctly before enabling redirects in production.

### Database

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_HOST`
- `POSTGRES_PORT`

### Redis / Cache / Broker

- `REDIS_URL`
- `CACHE_KEY_PREFIX`
- `CELERY_BROKER_URL`

### JWT

- `JWT_ACCESS_TOKEN_LIFETIME_MINUTES`
- `JWT_REFRESH_TOKEN_LIFETIME_DAYS`

### Throttling

- `THROTTLE_ANON_RATE`
- `THROTTLE_USER_RATE`
- `THROTTLE_LOGIN_RATE`
- `THROTTLE_RESERVATION_RATE`

### Email

- `EMAIL_BACKEND`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`
- `EMAIL_USE_TLS`
- `EMAIL_USE_SSL`
- `EMAIL_TIMEOUT`
- `DEFAULT_FROM_EMAIL`
- `TICKET_CONFIRMATION_EMAIL_SENT_TTL_SECONDS`

### Logging

- `LOG_LEVEL`

## Running Tests

### Full test suite

From the repository root, with the Docker stack running:

```bash
docker compose exec backend pytest -q
```

Do not run backend tests with `poetry run` on the host. The test environment is
Dockerized and should use the backend container.

### Run a specific test file

```bash
docker compose exec backend pytest tests/integration/test_catalog_api.py -q
docker compose exec backend pytest tests/integration/test_reservations_admin_crud_api.py -q
```

### Integration tests

Integration tests are under `tests/integration/` and validate end-to-end API behavior, including authentication, catalog, reservation/checkout concurrency behavior, throttling, error schema, and background task-related flows.

### CI validation

The CI workflow executes these validations inside the CI job environment:
- `docker compose run --rm backend python manage.py check`
- `docker compose run --rm backend python manage.py migrate --noinput`
- `docker compose run --rm backend pytest -q`
- Docker Compose config validation
- backend and frontend Docker image builds

For local development, use the Docker commands documented in this README.

## Manual Testing Guide

This guide can be executed with Postman or `curl`.

Base URL:
```bash
export BASE_URL="http://localhost:8000"
```

### Postman Environment

Suggested Postman environment variables:

- `BASE_URL`: `http://localhost:8000`
- `ACCESS_TOKEN`: JWT access token returned by login
- `SESSION_ID`: target session UUID
- `SEAT_ID`: target seat UUID from the seat map
- `TICKET_ID`: optional ticket UUID for direct ticket lookup

For authenticated requests in Postman:

- Authorization type: `Bearer Token`
- Token value: `{{ACCESS_TOKEN}}`

### Preconditions

- API is running.
- At least one session exists with seats in `AVAILABLE` status.
	- You can manage seat rows, seats, session seats, and tickets directly through `/api/v1/reservation/seat-rows/`, `/api/v1/reservation/seats/`, `/api/v1/reservation/session-seats/`, and `/api/v1/reservation/tickets/`.
	- If you create a session through the API, session seats are created automatically.
	- If you create a session directly through Django shell, you must also create the related `SessionSeat` records.

Optional bootstrap via Django shell (minimal base data):

```bash
	docker compose exec backend python manage.py shell
```

```python
from django.utils import timezone
from datetime import timedelta
from catalog.models import Genre, Movie, Room, Session
from reservations.models import SeatRow, Seat, SessionSeat

genre = Genre.objects.create(name="Action")
room = Room.objects.create(name="Room 1", capacity=20)
row = SeatRow.objects.create(room=room, name="A")
seat_1 = Seat.objects.create(row=row, number=1)
seat_2 = Seat.objects.create(row=row, number=2)

movie = Movie.objects.create(
	title="Interstellar",
	synopsis="A science fiction film.",
	duration_minutes=169,
	release_date="2014-11-07",
	poster_url="https://example.com/interstellar.jpg",
)
movie.genres.set([genre])

session = Session.objects.create(
	movie=movie,
	room=room,
	start_time=timezone.now() + timedelta(hours=2),
	end_time=timezone.now() + timedelta(hours=5),
	base_price="30.00",
)

SessionSeat.objects.create(session=session, seat=seat_1)
SessionSeat.objects.create(session=session, seat=seat_2)

print("SESSION_ID =", session.id)
print("SEAT_1_ID =", seat_1.id)
print("SEAT_2_ID =", seat_2.id)
```

### 1) Register user

```bash
curl -s -X POST "$BASE_URL/api/v1/auth/register/" \
	-H "Content-Type: application/json" \
	-d '{
		"email": "dev1@example.com",
		"username": "dev1",
		"password": "StrongPass123!"
	}'
```

Expected: `201 Created` with user payload (no password field).

### 2) Login and capture JWT

```bash
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/login/" \
	-H "Content-Type: application/json" \
	-d '{"email":"dev1@example.com","password":"StrongPass123!"}')

echo "$LOGIN_RESPONSE"
```

Expected: `200 OK` with `access` and `refresh`.

For Postman:

- Copy the `access` value into the `ACCESS_TOKEN` environment variable.

For `curl`:

- Copy the `access` token from `LOGIN_RESPONSE` and export it manually:
	```bash
	export ACCESS_TOKEN="<jwt-access-token>"
	```

### 2a) Refresh JWT access token

```bash
curl -s -X POST "$BASE_URL/api/v1/auth/token/refresh/" \
	-H "Content-Type: application/json" \
	-d '{"refresh":"<jwt-refresh-token>"}'
```

Expected: `200 OK` with a new `access` token.

### 3) List movies

```bash
curl -s "$BASE_URL/api/v1/catalog/movies/"
```

Expected: `200 OK` paginated list (`count`, `next`, `previous`, `results`).

### 4) List sessions

```bash
curl -s "$BASE_URL/api/v1/catalog/sessions/"
```

Expected: `200 OK` with nested `movie` and `room` in each session item.

### 5) View seat map

Set target session:
```bash
export SESSION_ID="<session-uuid>"
curl -s "$BASE_URL/api/v1/reservation/sessions/$SESSION_ID/seats/"
```

Expected: `200 OK` list of seat entries with `session_seat_id`, `seat_id`, `row`, `number`, `status`, and `is_accessible`. Authenticated responses also include `reserved_by_current_user`; seats reserved by the current user include `lock_expires_at`.

### 6) Reserve seats (temporary lock)

Set one available seat id from seat map:
```bash
export SEAT_ID="<seat-uuid>"

curl -s -X POST "$BASE_URL/api/v1/reservation/sessions/$SESSION_ID/reservations/" \
	-H "Authorization: Bearer $ACCESS_TOKEN" \
	-H "Content-Type: application/json" \
	-d "{\"seat_ids\":[\"$SEAT_ID\"]}"
```

Expected: `201 Created` with `status: TEMPORARILY_RESERVED`, `expires_at`, and reserved seats list.

### 7) Release a temporary reservation

```bash
export SESSION_SEAT_ID="<session-seat-uuid>"

curl -s -X DELETE "$BASE_URL/api/v1/reservation/sessions/$SESSION_ID/reservations/" \
	-H "Authorization: Bearer $ACCESS_TOKEN" \
	-H "Content-Type: application/json" \
	-d "{\"session_seat_ids\":[\"$SESSION_SEAT_ID\"]}"
```

Expected: `200 OK` with `status: RELEASED` and released seats restored to `AVAILABLE`.

### 8) Checkout (ticket generation)

```bash
curl -s -X POST "$BASE_URL/api/v1/reservation/checkout/" \
	-H "Authorization: Bearer $ACCESS_TOKEN" \
	-H "Content-Type: application/json" \
	-d "{
	  \"seats\": [
	    {
	      \"session_seat_id\": \"$SESSION_SEAT_ID\",
	      \"ticket_type\": \"inteira\"
	    }
	  ],
	  \"payment_method\": \"pix\"
	}"
```

Expected: `200 OK` with `status: PURCHASED`, computed `total_amount`, purchased
seats, and generated tickets. Pricing is computed server-side from
`Session.base_price`: `inteira` charges 100%, `meia` charges 50%.

The ticket records are created internally and can be verified via `GET /api/v1/users/me/tickets/`.

### 9) List user tickets

```bash
curl -s "$BASE_URL/api/v1/users/me/tickets/" \
	-H "Authorization: Bearer $ACCESS_TOKEN"
```

Expected: `200 OK` paginated ticket list. Optional filters:
- `/api/v1/users/me/tickets/?type=upcoming`
- `/api/v1/users/me/tickets/?type=past`

### Common error scenarios

- Invalid credentials on login: `401` with `error.code = INVALID_CREDENTIALS`
- Invalid or expired JWT on protected endpoints or token refresh: `401` with `error.code = NOT_AUTHENTICATED`
- Validation failure (missing/invalid fields): `400` with `error.code = VALIDATION_FAILED`
- Invalid checkout ticket type: `400` with `error.code = INVALID_TICKET_TYPE`
- Invalid checkout payment method: `400` with `error.code = INVALID_PAYMENT_METHOD`
- Seat already reserved/purchased: `409` with `error.code = SEAT_ALREADY_RESERVED`
- Rate limiting exceeded: `429` with `error.code = THROTTLED`

## Postman Routes Reference

### Support routes

| Method | Route | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `{{BASE_URL}}/health/` | No | Health check for DB, Redis, and Celery |
| `GET` | `{{BASE_URL}}/api/schema/` | No | OpenAPI schema |
| `GET` | `{{BASE_URL}}/api/docs/` | No | Swagger UI |

### Auth and user routes

| Method | Route | Auth | Body example |
| --- | --- | --- | --- |
| `POST` | `{{BASE_URL}}/api/v1/auth/register/` | No | `{"email":"dev1@example.com","username":"dev1","password":"StrongPass123!"}` |
| `POST` | `{{BASE_URL}}/api/v1/auth/login/` | No | `{"email":"dev1@example.com","password":"StrongPass123!"}` |
| `POST` | `{{BASE_URL}}/api/v1/auth/token/refresh/` | No | `{"refresh":"<jwt-refresh-token>"}` |
| `GET` | `{{BASE_URL}}/api/v1/users/me/` | Bearer | none |
| `GET` | `{{BASE_URL}}/api/v1/users/me/tickets/` | Bearer | none |
| `GET` | `{{BASE_URL}}/api/v1/users/me/tickets/?type=upcoming` | Bearer | none |
| `GET` | `{{BASE_URL}}/api/v1/users/me/tickets/?type=past` | Bearer | none |

### Catalog routes

| Method | Route | Auth | Body example |
| --- | --- | --- | --- |
| `GET` | `{{BASE_URL}}/api/v1/catalog/genres/` | No | none |
| `POST` | `{{BASE_URL}}/api/v1/catalog/genres/` | Admin | `{"name":"Sci-Fi"}` |
| `GET` | `{{BASE_URL}}/api/v1/catalog/genres/{genre_id}/` | No | none |
| `PATCH` | `{{BASE_URL}}/api/v1/catalog/genres/{genre_id}/` | Admin | `{"name":"Science Fiction"}` |
| `DELETE` | `{{BASE_URL}}/api/v1/catalog/genres/{genre_id}/` | Admin | none |
| `GET` | `{{BASE_URL}}/api/v1/catalog/movies/` | No | none |
| `POST` | `{{BASE_URL}}/api/v1/catalog/movies/` | Admin | `{"title":"Interstellar","genres":["{genre_id}"],"synopsis":"Space exploration.","duration_minutes":169,"release_date":"2014-11-07","poster_url":"https://example.com/interstellar.jpg"}` |
| `GET` | `{{BASE_URL}}/api/v1/catalog/movies/{movie_id}/` | No | none |
| `PATCH` | `{{BASE_URL}}/api/v1/catalog/movies/{movie_id}/` | Admin | `{"title":"Interstellar Remastered"}` |
| `DELETE` | `{{BASE_URL}}/api/v1/catalog/movies/{movie_id}/` | Admin | none |
| `GET` | `{{BASE_URL}}/api/v1/catalog/rooms/` | No | none |
| `POST` | `{{BASE_URL}}/api/v1/catalog/rooms/` | Admin | `{"name":"Room 2","capacity":80}` |
| `GET` | `{{BASE_URL}}/api/v1/catalog/rooms/{room_id}/` | No | none |
| `PATCH` | `{{BASE_URL}}/api/v1/catalog/rooms/{room_id}/` | Admin | `{"name":"Room Prime","capacity":100}` |
| `DELETE` | `{{BASE_URL}}/api/v1/catalog/rooms/{room_id}/` | Admin | none |
| `GET` | `{{BASE_URL}}/api/v1/catalog/sessions/` | No | none |
| `POST` | `{{BASE_URL}}/api/v1/catalog/sessions/` | Admin | `{"movie":"{movie_id}","room":"{room_id}","start_time":"2026-03-23T18:00:00Z","end_time":"2026-03-23T20:55:00Z","base_price":"30.00"}` |
| `GET` | `{{BASE_URL}}/api/v1/catalog/sessions/{session_id}/` | No | none |
| `PATCH` | `{{BASE_URL}}/api/v1/catalog/sessions/{session_id}/` | Admin | `{"end_time":"2026-03-23T21:10:00Z"}` |
| `DELETE` | `{{BASE_URL}}/api/v1/catalog/sessions/{session_id}/` | Admin | none |

Notes:

- Updating a `Genre` is useful when it is already linked to multiple movies.
- Updating a `Session` is supported, but changing its `room` after creation is rejected to avoid inconsistency with existing `SessionSeat` records.
- Creating a `Session` through the API creates its `SessionSeat` records automatically from the seats already registered for that room.
- `Room.capacity` is the maximum allowed layout size: registered seats cannot exceed it, and it cannot be reduced below the registered seat count.
- Seat rows and seats cannot be created, updated, or deleted for a room that already has future sessions.
- A session with reserved or purchased seats cannot change `movie`, `room`, `start_time`, `end_time`, or `base_price`.

### Reservation routes

| Method | Route | Auth | Body example |
| --- | --- | --- | --- |
| `GET` | `{{BASE_URL}}/api/v1/reservation/seat-rows/` | Admin | none |
| `POST` | `{{BASE_URL}}/api/v1/reservation/seat-rows/` | Admin | `{"room":"{room_id}","name":"A"}` |
| `GET` | `{{BASE_URL}}/api/v1/reservation/seat-rows/{seat_row_id}/` | Admin | none |
| `PATCH` | `{{BASE_URL}}/api/v1/reservation/seat-rows/{seat_row_id}/` | Admin | `{"name":"B"}` |
| `DELETE` | `{{BASE_URL}}/api/v1/reservation/seat-rows/{seat_row_id}/` | Admin | none |
| `GET` | `{{BASE_URL}}/api/v1/reservation/seats/` | Admin | none |
| `POST` | `{{BASE_URL}}/api/v1/reservation/seats/` | Admin | `{"row":"{seat_row_id}","number":1}` |
| `GET` | `{{BASE_URL}}/api/v1/reservation/seats/{seat_id}/` | Admin | none |
| `PATCH` | `{{BASE_URL}}/api/v1/reservation/seats/{seat_id}/` | Admin | `{"number":2}` |
| `DELETE` | `{{BASE_URL}}/api/v1/reservation/seats/{seat_id}/` | Admin | none |
| `GET` | `{{BASE_URL}}/api/v1/reservation/session-seats/` | Admin | none |
| `POST` | `{{BASE_URL}}/api/v1/reservation/session-seats/` | Admin | `{"session":"{session_id}","seat":"{seat_id}"}` |
| `GET` | `{{BASE_URL}}/api/v1/reservation/session-seats/{session_seat_id}/` | Admin | none |
| `DELETE` | `{{BASE_URL}}/api/v1/reservation/session-seats/{session_seat_id}/` | Admin | none |
| `GET` | `{{BASE_URL}}/api/v1/reservation/tickets/` | Admin | none |
| `GET` | `{{BASE_URL}}/api/v1/reservation/tickets/{ticket_id}/` | Admin | none |
| `DELETE` | `{{BASE_URL}}/api/v1/reservation/tickets/{ticket_id}/` | Admin | none |
| `GET` | `{{BASE_URL}}/api/v1/reservation/sessions/{{SESSION_ID}}/seats/` | No | none |
| `POST` | `{{BASE_URL}}/api/v1/reservation/sessions/{{SESSION_ID}}/reservations/` | Bearer | `{"seat_ids":["{{SEAT_ID}}"]}` |
| `POST` | `{{BASE_URL}}/api/v1/reservation/checkout/` | Bearer | `{"seats":[{"session_seat_id":"{{SESSION_SEAT_ID}}","ticket_type":"inteira"}],"payment_method":"pix"}` |

Notes:

- `SeatRow` and `Seat` support full CRUD because they are structural resources.
- `SessionSeat` and `Ticket` intentionally do not expose `PATCH` endpoints.
- `SessionSeat` state transitions should happen through reservation and checkout flows, not arbitrary updates.
- `Ticket` records are created by checkout; the direct ticket API is read/delete only for admins.

## Error Handling

All API errors follow a standardized structure:

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

Benefits:
- consistent error contracts across endpoints
- simpler client-side handling and observability
- safer 500 responses (internal details are not leaked)

## CI

This project currently implements Continuous Integration (CI) only. The pipeline exists to prevent regressions and keep the repository production-ready by validating code correctness, test execution, build integrity, and container reproducibility on every change to `main`, ensuring every change remains buildable, testable, and container-ready.

GitHub Actions workflow (`../.github/workflows/main.yml`) validates backend and frontend responsibilities independently.

1. **Validate Backend**
	 - provisions PostgreSQL + Redis through Docker Compose
	 - builds the backend image from `backend/`
	 - runs `manage.py check`, migrations, and full tests inside the backend container

2. **Validate Frontend**
	 - installs frontend dependencies from `frontend/`
	 - runs lint, tests, and production build

3. **Validate Docker Builds**
	 - validates Compose configuration
	 - builds backend and frontend images from their application directories

Pipeline behavior:
- trigger on push and pull requests to `main`
- fail-fast per job step (any failing step fails the job)
