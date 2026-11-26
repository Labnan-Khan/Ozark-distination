# Property Rental Platform — Backend (V1)

Modular MERN backend implementing the approved architecture in `../docs/`.

## Quick start

```bash
cp .env.example .env
npm install
npm run seed
npm run indexes
npm run dev
```

- API base: `http://localhost:5000/api/v1`
- Health: `/health/live`, `/health/ready`
- Default seed admin: `admin@example.com` / `ChangeMe123456!` (change immediately)
- Start `npm run worker` for outbox/email processing and `npm run scheduler` for recurring maintenance jobs in separate terminals.

A MongoDB replica set is required for multi-document transactions (registration, booking confirmation, change-request application). A standalone `mongod` will only serve migrations, seeds, reads, and non-transactional writes.

## Monitoring & error tracking

- **Health endpoints:** `GET /health/live` (process up) and `GET /health/ready` (service ready). Point the container/platform probes at these paths.
- **Structured logs:** pino emits one JSON object per event with `requestId`, `actorId`, `method`, `path`, `statusCode`, and `durationMs`. Password, token, refresh-token, cookie, and authorization-header fields are redacted.
- **Request correlation:** `x-request-id` (and optional `x-correlation-id`) are accepted on input and echoed on responses; the same `requestId` is attached to error responses and logs.
- **Errors:** the `{ success: false, error: { code, message, details, requestId } }` envelope keeps `requestId` for support lookups; stack traces are only included outside production.
- **External tracker extension point:** V1 has no third-party error tracker. To add one, hook the error branch of `src/middleware/errorHandler.js` and/or add a pino destination in `src/infrastructure/logging/index.js`; never log credentials or raw request bodies.
- **Long-running processes:** `npm start` (API), `npm run worker` (outbox/email dispatcher), and `npm run scheduler` (recurring maintenance) are separate processes and should be deployed and monitored independently with the same environment. `docker-compose.yml` defines all three.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server with watch |
| `npm start` | Production server |
| `npm run worker` | Event/job dispatcher worker |
| `npm run scheduler` | Availability projection, session cleanup, media cleanup, booking reminders |
| `npm run scheduler -- --once` | Run every scheduled job once and exit |
| `npm run seed` | Seed admin, categories, amenities, settings |
| `npm run indexes` | Create all declared indexes |
| `npm run migrate` | Apply migrations (`npm run migrate -- down`, `-- --dry-run`, `-- --version 1`) |
| `npm test` | Jest unit + integration tests |
| `npm run test:unit` | Unit tests only |

## Architecture

- `src/modules/*` — business modules (models, services, controllers, routes, validation).
- `src/shared` — constants, errors, validators, utilities, permission registry.
- `src/infrastructure` — email, storage, events/outbox, jobs, logging adapters.
- `src/middleware` — auth, authorization, validation, rate limiting, error handling, uploads.
- `src/database` — migrations (apply/rollback/dry-run), seeders, index definitions.
- `src/routes` — versioned route composition (`/api/v1`).

Modules communicate via public service interfaces (`module/index.js`) and domain events written to `eventOutbox` inside business transactions. Controllers never write to models directly.

## Conventions

- Response envelope: `{ success: true, data, meta }` / `{ success: false, error: { code, message, details, requestId } }`.
- Money is an integer in minor units plus ISO-4217 `currency`.
- Booking dates are `YYYY-MM-DD` at the API boundary.
- JWT access token + rotating refresh token stored hashed in `sessions`.
- Role checks go through the centralized permission registry; ownership is checked in services.

## Testing

- `tests/unit` — pure business rules (pricing, state machine, permissions, utilities).
- `tests/integration` and `tests/e2e` — API smoke and contract tests.
- `tests/workflows` — 13 database-backed workflow tests covering auth, approval, booking, cancellation, deletion, and property lifecycle. These skip automatically when no database is reachable.

Set `TEST_MONGODB_URI` to a disposable MongoDB replica-set URI to run the workflow suites. The full suite then runs 56 tests.

## Documentation

See `../docs/README.md` for the architecture, database, API, workflow, permission, roadmap, and decision documents.
