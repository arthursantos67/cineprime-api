# Cinepolis Natal Frontend

Browser-based SPA foundation for the full-stack Cinepolis Natal platform.

This workspace intentionally contains placeholders only. Full cinema UI flows will be implemented in dedicated frontend issues.

## Stack

- Next.js
- App Router
- TypeScript
- Node.js test runner with `tsx`
- ESLint

## Routes

The scaffold defines the PRD page entrypoints:

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

## API Configuration

The API client boundary lives at [`src/api/client.ts`](./src/api/client.ts).

Set the backend base URL with:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

For local setup:

```bash
cp .env.example .env.local
```

## Commands

```bash
npm install
npm run dev
npm run lint
npm run test
npm run e2e
npm run build
```

The Next.js dev server runs on `http://localhost:3000`.

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

From the repository root:

```bash
docker compose up frontend
```

The Compose service injects `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` so the browser can call the backend through the host-exposed API port.
