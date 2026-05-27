# CinePrime Frontend

Next.js App Router frontend for the full-stack CinePrime cinema ticket reservation platform.

## Stack

- Next.js
- App Router
- TypeScript
- Node.js test runner with `tsx`
- Playwright
- ESLint

## Routes

The frontend implements the PRD purchase and account entrypoints:

| Route | Page |
| --- | --- |
| `/` | Home |
| `/movies/[movieId]` | Movie Detail |
| `/sessions/[sessionId]/seats` | Seat Selection |
| `/ticket-types` | Ticket Type Selection |
| `/checkout` | Checkout |
| `/confirmation` | Confirmation |
| `/my-tickets` | My Tickets |
| `/login` | Login |
| `/register` | Register |

## Authentication Model

Authentication uses JWT tokens issued by the Django/DRF backend at
`/api/v1/auth/login/`. The frontend applies a **sessionStorage-based refresh
token persistence** strategy:

| Storage | What is stored | Lifetime |
|---|---|---|
| In-memory (React state + ref) | Access token | Current page session only |
| `sessionStorage` | Refresh token | Tab session (cleared on tab close) |
| `localStorage` | Nothing | — |

**Why sessionStorage for the refresh token?**

- The access token is short-lived and never written to any browser storage.
  An XSS attack cannot steal it across sessions.
- The refresh token survives page reloads within the same tab, so users are
  not forced to log in again after every refresh.
- Closing the tab clears `sessionStorage`, so sessions do not persist beyond
  the current browser tab — a deliberate tradeoff in favor of security over
  long-term convenience.

**Reload behavior:**

1. On mount, `AuthProvider` reads the refresh token from `sessionStorage`.
2. If a token is found, it calls `/api/v1/auth/token/refresh/` to obtain a
   new access token, then `/api/v1/users/me/` to restore user data.
3. If the refresh fails (expired or revoked token), the stored token is
   removed and the user is redirected to `/login` by the protected route guard.
4. If no token is found, the user is immediately treated as unauthenticated.

**Logout:**

Logout clears both the in-memory access token and the persisted refresh token
from `sessionStorage`. Any subsequent navigation to a protected route redirects
to `/login`.

**Security tests:**

`src/contexts/auth-security.test.ts` statically asserts these invariants:

- `localStorage` is never used for any token.
- `sessionStorage` is only touched by `auth-persistence.ts` and only for the
  refresh token — never for the access token.
- `auth-state.ts`, `client.ts`, and `auth.ts` contain no browser storage
  references.

## API Configuration

The API client boundary lives at [`src/api/client.ts`](./src/api/client.ts).
Catalog helpers in [`src/api/catalog.ts`](./src/api/catalog.ts) expose typed
movie filters for `em_cartaz`, `pre_venda`, and `em_breve` through
`listNowShowingMovies()`, `listPreSaleMovies()`, and `listUpcomingMovies()`.
Session responses also accept optional room and format metadata
(`experience_type`, `display_name`, `audio_format`, `projection_format`, and
`session_type`) used to render badges such as VIP, 3D, Legendado, Dublado, and
Pré-estreia on session selection and checkout.

The frontend requires `NEXT_PUBLIC_API_BASE_URL`, an absolute `http` or `https`
URL for the Django/DRF API. Because this is a `NEXT_PUBLIC_*` variable, it is
compiled into browser code during `npm run build`; set the production value at
build time, not only when starting the container.

Local development example:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

For local setup:

```bash
cp .env.example .env.local
```

Docker Compose sets `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` for the
frontend dev service. This lets the browser call the backend through the API
port exposed on the host.

Production deployments should set the public API URL to the deployed backend
origin, for example `https://api.example.com`, while the backend separately
allows the frontend origin through CORS configuration. Do not commit secrets to
frontend env files; public frontend variables are visible to users.

`NEXT_IMAGE_REMOTE_HOSTNAMES` may be set at build time with a comma-separated
list of trusted HTTPS poster/CDN hostnames for Next.js image configuration. The
movie poster surfaces intentionally pass externally supplied `poster_url` values
through `next/image` with optimization disabled, so arbitrary API data is not
fetched server-side by the Next.js image optimizer.

The production build validates this required variable with:

```bash
npm run validate:env
```

## Commands

Install with the lockfile:

```bash
npm ci
```

Run the local dev server on `http://localhost:3000`:

```bash
npm run dev
```

Quality and build checks:

```bash
npm run lint
npm run test
npm run e2e:ci
npm run build
```

`npm run test` covers unit and integration tests under `src/`.
After a successful build, `npm run start` runs the generated Next.js standalone
server.

## Browser E2E Tests

The frontend uses Playwright for browser coverage of the critical purchase and
guard flows required by the PRD.

```bash
npm run e2e
npm run e2e:ci
```

The Playwright config is scoped to this package in
[`playwright.config.ts`](./playwright.config.ts). It starts the Next.js app on
`http://127.0.0.1:3100` and injects a stable
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:40123`.

E2E tests do not call a live backend. They mock all `/api/v1/**` browser
requests through Playwright route handlers in [`e2e/support`](./e2e/support),
using fixed catalog, auth, reservation, checkout, and expiration data. This
keeps CI deterministic and avoids Redis, Celery, payment gateways, third-party
services, or uncontrolled seed data.

For a new CI job, install browsers once before running the CI script:

```bash
npx playwright install --with-deps chromium
npm run e2e:ci
```

Failure artifacts are retained under `test-results/`, and the HTML report is
written to `playwright-report/`; both paths are ignored by git.

## Docker

### Development

The root Compose file uses [`Dockerfile.dev`](./Dockerfile.dev), bind mounts the
frontend source, installs dependencies into a named volume, and runs the Next.js
development server:

```bash
docker compose up frontend
```

This path is intended for local work and remains hot-reload friendly.

### Production Image

The default [`Dockerfile`](./Dockerfile) is production-oriented:

- installs dependencies with `npm ci`
- builds with `npm run build`
- uses Next.js `output: "standalone"`
- copies only the standalone server and static assets into the runtime stage
- starts with `node server.js`, matching the package `npm run start` strategy

Build it from the repository root with the public API URL supplied at build
time:

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  --build-arg NEXT_IMAGE_REMOTE_HOSTNAMES=cdn.example.com \
  -t cineprime-frontend:prod \
  frontend
```

Run the production container:

```bash
docker run --rm -p 3000:3000 cineprime-frontend:prod
```

Static CDN or Nginx-only hosting should not be assumed for this app. Use that
strategy only if the project is explicitly changed to a static export and the
routes/data-fetching behavior are validated for that mode.

## CI

GitHub Actions validates the frontend from this package with:

```bash
npm ci
npm run lint
npm run test
npx playwright install --with-deps chromium
npm run e2e:ci
npm run build
```

The Docker validation job also builds the production frontend image with
`NEXT_PUBLIC_API_BASE_URL` passed as a build argument.
