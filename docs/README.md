# Architecture & Database Blueprint — Approved V1 Reference

Project: scalable MERN property rental management platform.

This package contains the approved V1 architecture and implementation reference. The backend implementation lives in `backend/` and has been applied to the final database.

## Reading order

| Order | Document | Phase |
|---|---|---|
| 1 | [00-requirements-analysis.md](./00-requirements-analysis.md) | Phase 1 — requirements, assumptions, conflicts |
| 2 | [01-system-architecture.md](./01-system-architecture.md) | Phase 2 — modular monolith, modules, flows |
| 3 | [02-database-blueprint.md](./02-database-blueprint.md) | Phase 3 — collections, fields, indexes |
| 4 | [03-database-relationships.md](./03-database-relationships.md) | Phase 3 — ER diagram |
| 5 | [04-api-blueprint.md](./04-api-blueprint.md) | Phase 5 — REST API |
| 6 | [05-permission-matrix.md](./05-permission-matrix.md) | Phase 5 — roles and permissions |
| 7 | [06-workflows.md](./06-workflows.md) | Phase 4 — lifecycles and state machines |
| 8 | [07-version-roadmap.md](./07-version-roadmap.md) | Phase 7 — V1/V2/V3 extension points |
| 9 | [08-future-compatibility-review.md](./08-future-compatibility-review.md) | Phase 6 — gap review |
| 10 | [09-technical-decision-log.md](./09-technical-decision-log.md) | Phase 7 — decisions and trade-offs |

## Approved decisions (V1 implementation basis)

The following decisions were approved and are implemented in `backend/`; phase-gate status is tracked in `00-requirements-analysis.md`.

1. **Recommended defaults** in section 5 of `00-requirements-analysis.md` are in force (same-day turnover, no pending-booking date holds in V1, documented cancellation policy, and admin-created properties).
2. **Account model:** one `users` collection with a `roles` array constrained to exactly one role in V1.
3. **Availability concurrency design:** per-date reservation documents inside a MongoDB transaction with a compound unique index.
4. **Collection set** in `02-database-blueprint.md`, including the additional justified collections (`availabilityReservations`, `approvalHistory`, `bookingHistory`, `media`, `duplicateFlags`, `deletionRequests`, `passwordResetTokens`, `settings`, `eventOutbox`).
5. **API response envelope** and `/api/v1` route convention.
6. **V1 scope boundary** (no payments, reviews, verification, messaging, multi-currency settlement, or advanced pricing); those capabilities stay behind the extension points documented in `07-version-roadmap.md`.

V1 backend implementation is complete with module-by-module tests. Future versions extend the same contracts rather than replacing V1 decisions.
