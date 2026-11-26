# Document 9 — Technical Decision Log (Phase 7)

Format: **Decision**, **Reason**, **Alternatives considered**, **Trade-offs**, **Future implications**.

---

## D-01 Modular monolith instead of microservices

- **Decision:** One Express application with bounded modules; no microservices in V1.
- **Reason:** Transactions span properties, bookings, and notifications; a single database avoids distributed consistency problems. Team/complexity cost of microservices is unjustified at V1 scale.
- **Alternatives:** Microservices per domain; serverless functions.
- **Trade-offs:** All modules deploy together; a severe bug can affect the whole app. Requires discipline to keep boundaries clean.
- **Future:** Modules with service interfaces and events can be extracted individually (bookings/notifications first).

## D-02 Single `users` collection with a `roles` array

- **Decision:** All account types in `users`; `roles` is an array but V1 enforces exactly one role.
- **Reason:** Reusable authentication, one email index, simple reference integrity; array avoids a future collection split.
- **Alternatives:** Separate `customers`/`owners`/`admins` collections; one collection with a single `role` string.
- **Trade-offs:** Must enforce the one-role invariant in service/validation; multi-role requires a permission review before enabling.
- **Future:** Multi-role and delegated manager roles become data/permission changes, not schema migrations.

## D-03 Separate registration endpoints for customer and owner

- **Decision:** `/auth/register/customer` and `/auth/register/owner`; role never accepted from request body; admin creation under `/admin`.
- **Reason:** Prevents role escalation and matches the requirement that customer/owner are separate account types.
- **Alternatives:** One endpoint with client-supplied `accountType` (rejected — privilege escalation risk).
- **Trade-offs:** Two similar endpoints; shared service logic keeps duplication minimal.
- **Future:** Additional account types can be added as new endpoints with server-side role mapping.

## D-04 Access JWT + rotating hashed refresh tokens in `sessions`

- **Decision:** Short-lived JWT access tokens; opaque refresh tokens stored hashed with rotation, family reuse detection, and `tokenVersion` on users.
- **Reason:** Logout/password change/suspension must invalidate access quickly; rotation limits token theft impact.
- **Alternatives:** JWT-only with long expiry (poor revocation); server-only sessions for every request (more DB reads).
- **Trade-offs:** Extra session collection and rotation logic; requires careful clock/TTL management.
- **Future:** Device management, login history, and 2FA step-up claims build on sessions; Redis can back the session store.

## D-05 Dynamic categories with typed, validated attribute schemas

- **Decision:** `propertyCategories.attributeSchema` defines key/type/constraints; properties store typed `attributes` records; service validates against the schema.
- **Reason:** Supports houses, offices, hotels, land, and unknown future categories without core schema rewrites, while avoiding uncontrolled arbitrary fields.
- **Alternatives:** Hardcoded fields per category; fully schemaless `metadata` object.
- **Trade-offs:** Validation code is more complex; multikey indexes on attributes add write overhead.
- **Future:** New categories/attributes are admin data operations; popular filters can move to a search projection.

## D-06 Independent listings with reserved `parentPropertyId`

- **Decision:** Every rentable unit is its own property document; `parentPropertyId` exists but has no V1 behavior.
- **Reason:** Matches the explicit requirement and avoids a building/unit hierarchy complicating V1 bookings.
- **Alternatives:** Mandatory building→unit model in V1 (rejected as premature).
- **Trade-offs:** Repeated building-level data for multi-unit owners; duplicate detection must be advisory.
- **Future:** Portfolios/hierarchies can be layered on top without changing booking logic.

## D-07 Separate property status dimensions

- **Decision:** `listingStatus`, `approvalStatus`, `availability.status` are independent, with documented valid combinations.
- **Reason:** Requirement explicitly forbids one overloaded status; booked listings must stay visible.
- **Alternatives:** One `status` enum (rejected; combinatorially explosive and ambiguous).
- **Trade-offs:** More fields to keep in sync; need projection logic for availability cache.
- **Future:** New dimensions (e.g., maintenance, promotion) can be added independently.

## D-08 Date-level reservation ledger with unique index + transactions

- **Decision:** `availabilityReservations` with unique `{propertyId, date}`; insert/delete inside the booking transaction; duplicate key → `409`.
- **Reason:** A simple availability query is racy; atomic unique inserts safely handle simultaneous bookings.
- **Alternatives:** Read-then-write check (racy); application mutex (fails with multiple app processes); per-property embedded busy array (unbounded growth).
- **Trade-offs:** Long rentals create many documents; requires MongoDB replica set.
- **Future:** Interval compression or specialized calendar service can optimize without changing booking APIs.

## D-09 Same-day turnover allowed; pending requests do not hold dates

- **Decision:** Check-out day is not locked; new booking may start that day. Pending requests reserve nothing; approval rechecks atomically (D1/D2).
- **Reason:** Clear boundary rule and simpler V1 request workflow; owner decisions are not blocked by stale holds.
- **Alternatives:** Lock checkout day (rejects legitimate back-to-back bookings); hold pending dates (requires expiry policy now).
- **Trade-offs:** A request can be approved-then-conflict; mitigated by 409 recheck.
- **Future:** Hold-with-expiry and configurable turnover rules can be introduced as policies.

## D-10 Server-side pricing with immutable snapshots and integer minor units

- **Decision:** Backend calculates amounts from property rates; booking stores `priceSnapshot` with currency; no floats and no frontend amounts accepted.
- **Reason:** Financial correctness and historical integrity; supports future taxes/fees/currencies.
- **Alternatives:** Client-computed total (insecure); storing only `propertyId` and current price (historical bookings change).
- **Trade-offs:** Pricing logic must be centralized and well-tested; currency conversion not handled in V1.
- **Future:** Pricing rule engine and FX service plug into `pricing.service.js`; old snapshots stay intact.

## D-11 Controlled booking state machine and `bookingHistory`

- **Decision:** All status changes go through named service transitions with an allowed-transition table; history is append-only.
- **Reason:** Prevents arbitrary updates from controllers and makes invalid transitions testable.
- **Alternatives:** Direct `updateOne({status})` in controllers (rejected; integrity risk).
- **Trade-offs:** More code per transition; worthwhile for a core workflow.
- **Future:** New states (extended, recurring, expired) are additive enum values plus transition rules.

## D-12 Cancellation rules behind a policy service

- **Decision:** Customer requests are reviewed, never auto-applied; owner/admin direct cancellation allowed with reason; policy service owns rules.
- **Reason:** Requirement defers exact cancellation policy; centralizing avoids scattering rules.
- **Alternatives:** Hardcoded rules in controllers (rejected); fully configurable engine in V1 (overengineering).
- **Trade-offs:** Default policy is an assumption needing confirmation (D4).
- **Future:** Per-property policies, refunds, and penalties become rule data + payment events.

## D-13 Dedicated `propertyChangeRequests` collection

- **Decision:** Booked properties cannot be edited directly; changes are proposed with snapshots, reviewed, and applied via whitelisted patch in a transaction.
- **Reason:** Explicit V1 requirement; protects active bookings while preserving auditability.
- **Alternatives:** Editing with a `modifiedAt` flag (insufficient); editing the live document and emailing admin (unsafe).
- **Trade-offs:** Extra workflow and UI; required for correctness.
- **Future:** Policy can allow direct edits for low-risk fields without changing storage.

## D-14 Duplicate detection as advisory flags, not constraints

- **Decision:** `duplicateFlags` with versioned strategies and scores; admin reviews; no unique address index.
- **Reason:** Multiple legitimate units can share an address or building; automatic rejection would block valid listings.
- **Alternatives:** Unique `(owner, address)` (wrong); title similarity only (unreliable).
- **Trade-offs:** Requires admin review capacity; false positives expected.
- **Future:** New strategies/ML models plug into the strategy registry.

## D-15 Media as records, not embedded blobs

- **Decision:** `media` collection with provider identifiers/URLs; `properties.media.coverMediaId`; safe delete workflow.
- **Reason:** Images must live in object storage; future media types need a generic model.
- **Alternatives:** Binary in MongoDB (rejected); URLs embedded as strings (no metadata or cleanup lifecycle).
- **Trade-offs:** Additional collection and cleanup job.
- **Future:** Videos, tours, floor plans, documents use the same collection with new `resourceType` values.

## D-16 Event bus with MongoDB outbox

- **Decision:** Domain events with stable envelopes; publishers write to `eventOutbox` in the business transaction; workers dispatch idempotently with retries/dead-letter.
- **Reason:** A committed booking must not lose its notification or audit record if email fails; providers may change.
- **Alternatives:** Direct calls from controllers (coupled, lossy); full Kafka/RabbitMQ in V1 (premature infrastructure).
- **Trade-offs:** Eventually consistent side effects; outbox needs monitoring/archival.
- **Future:** Swap dispatcher for Redis/Kafka using the same `EventBus` interface.

## D-17 Provider interfaces for external services

- **Decision:** `EmailProvider`, `StorageProvider`, `JobQueue`, `EventBus`, `SearchRepository`, `CacheProvider`, `RateLimiter` interfaces with V1 adapters/no-ops.
- **Reason:** Avoids vendor lock-in and keeps business logic independent of SDKs.
- **Alternatives:** Calling SDKs directly (simpler now, expensive to change later).
- **Trade-offs:** More indirection and configuration code.
- **Future:** Multiple gateways/channels/search engines become adapter additions.

## D-18 Centralized RBAC permission registry + ownership resolvers

- **Decision:** Canonical permission strings; role→permission map in one place; `authorize()` plus service-level ownership checks.
- **Reason:** Requirement forbids scattered hardcoded admin checks and IDOR vulnerabilities.
- **Alternatives:** Role string checks in each controller (rejected).
- **Trade-offs:** Permission names must be maintained; every new endpoint needs an explicit permission decision.
- **Future:** Scoped grants for managers/agents and 2FA step-up add conditions to `authorize()`.

## D-19 Soft delete, tombstones, and snapshots by default

- **Decision:** `deletedAt` for users/properties/categories/amenities; user tombstoning on deletion; snapshots on properties/bookings.
- **Reason:** Preserve bookings, audit trails, and reference integrity; support compliance later.
- **Alternatives:** Hard cascade delete (destroys history); no snapshots (historical records change meaning).
- **Trade-offs:** Tombstones and stale data need cleanup/reporting strategy; queries must exclude deleted records.
- **Future:** Retention/purge module can act on documented tombstones with legal policy input.

## D-20 Zod validation at the boundary plus service revalidation

- **Decision:** Zod schemas per route and reusable validators; services recheck business invariants.
- **Reason:** Dynamic category attributes need typed validation; frontend cannot be trusted.
- **Alternatives:** Mongoose-only validation (too late/incomplete); no validation (unsafe).
- **Trade-offs:** Duplicate validation in some paths; acceptable for a core financial workflow.
- **Future:** Shared schemas can generate API docs and frontend types.

## D-21 Pagination everywhere and repository interface for search

- **Decision:** All lists paginated with consistent `meta`; search behind `PropertySearchRepository`.
- **Reason:** Property/booking collections grow large; future search engine swap must not change endpoints.
- **Alternatives:** Unpaginated endpoints (fails at scale); direct aggregation in controllers (coupled).
- **Trade-offs:** Cursor pagination deferred; offset pagination has deep-page limits.
- **Future:** Cursor pagination and dedicated search engines are adapter/API changes.

## D-22 MongoDB replica set transactions assumed in production

- **Decision:** Multi-document transactions for booking confirmation, change application, approval events.
- **Reason:** Atomicity across booking + reservations + outbox is required.
- **Alternatives:** Eventually consistent compensating actions (complex, error-prone).
- **Trade-offs:** Requires replica set; slightly higher write cost; retry logic needed for transient errors.
- **Future:** Sharding/zone design can be introduced once key/query patterns are proven.

## D-23 API versioning through route adapters

- **Decision:** `/api/v1` mounted from module route files; v2 will add adapters, not duplicate services.
- **Reason:** Breaking changes are inevitable long-term; business logic should not be rewritten for response shape changes.
- **Alternatives:** Version field in body (messy); no versioning (blocks evolution).
- **Trade-offs:** Maintaining two adapters during transition.
- **Future:** Mobile-specific and partner APIs can be separate adapters over the same services.

## D-24 Typed settings collection instead of code constants for policies

- **Decision:** Admin-managed `settings` with per-key Zod validation and safe defaults in `appConfig.js`.
- **Reason:** Limits like max images, currency default, rate limits, and feature flags must change without deploys.
- **Alternatives:** Hardcoded constants (inflexible); fully dynamic untyped config (unsafe).
- **Trade-offs:** Settings keys need documentation and validation schemas.
- **Future:** Feature flags enable staged rollouts of V2 capabilities.

## D-25 Append-only audit logs

- **Decision:** `auditLogs` has no ordinary update/delete path; admin actions recorded with actor, action, target, safe before/after, reason, metadata.
- **Reason:** Compliance and debugging; requirement explicitly calls for protected logs.
- **Alternatives:** Application logs only (unstructured, easy to lose); mutable audit rows (untrustworthy).
- **Trade-offs:** Storage growth; need future archival/retention policy.
- **Future:** Compliance retention modules can archive without rewriting records.

## D-26 Testing built into state machines and interfaces

- **Decision:** Unit tests for services/rules, integration tests for DB+auth+API, e2e for user journeys including concurrency and overlap.
- **Reason:** Core booking and approval rules are too important to verify manually.
- **Alternatives:** Manual QA only (insufficient for concurrency and history rules).
- **Trade-offs:** Test infrastructure investment before feature work.
- **Future:** Tests act as regression guard during module extraction and migrations.
