# Cinepolis Natal

Full-stack cinema reservation system with a Django/DRF backend and a browser-based SPA frontend.

Detailed product requirements are in [`product-requirements-document.md`](./product-requirements-document.md).

## Repository Layout

| Path | Ownership |
| --- | --- |
| [`backend/`](./backend/) | Django API, DRF apps, tests, Python dependency files, backend Dockerfile, Postman collection |
| [`frontend/`](./frontend/) | Next.js App Router app, API client boundary, frontend Dockerfiles, tests |
| [`docker-compose.yml`](./docker-compose.yml) | Full-stack local runtime wiring |
| [`.github/workflows/`](./.github/workflows/) | Independent backend, frontend, and Docker validation |
| [`product-requirements-document.md`](./product-requirements-document.md) | Full-stack PRD |

## Local Development

Create the root Compose environment file, then start the stack:

```bash
cp .env.example .env
docker compose up --build
```

The backend container uses its Dockerfile startup command, which applies Django
migrations before starting the development server.

Services:

- Backend API: `http://localhost:8000`
- API docs: `http://localhost:8000/api/docs/`
- Health checks: `http://localhost:8000/health/live/`, `/health/ready/`, `/health/deep/`
- Frontend dev server: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Backend

Backend commands and API documentation live in [`backend/README.md`](./backend/README.md).

> Backend commands must run inside Docker. Do not run `poetry run` on the host;
> use `docker compose exec backend ...` or `docker compose run --rm backend ...`.

Common root-level Docker commands:

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend pytest -q
docker compose exec celery celery -A cinepolis_natal_api inspect ping
```

## Frontend

Frontend commands, Docker usage, and deployment notes live in [`frontend/README.md`](./frontend/README.md).

Common local commands:

```bash
cd frontend
npm ci
npm run dev
npm run lint
npm run test
npm run e2e:ci
npm run build
```

The frontend requires `NEXT_PUBLIC_API_BASE_URL`. Local Compose injects
`http://localhost:8000` for the frontend dev service; production frontend Docker
builds must receive the deployed API origin as a build argument.

## CI

GitHub Actions validates the two apps independently:

- backend Docker Compose checks, migrations, and tests
- frontend install, lint, unit/integration tests, Playwright E2E, and build from `frontend/`
- Docker Compose config plus backend and production frontend image builds
