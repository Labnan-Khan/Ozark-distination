# Document 7 — Version Roadmap (Phase 7)

Design rule: V1 establishes **boundaries, stable IDs, interfaces, and snapshots**, not every feature. Future versions add modules and optional fields with controlled migrations.

## 1. Initial implementation (V1)

| Area | Included |
|---|---|
| Architecture | Modular monolith, `/api/v1`, service layer, validation layer, centralized errors, permission registry, event bus + outbox, job scaffold, provider adapters |
| Auth | Customer/owner registration, login, logout, refresh rotation, forgot/reset password, rate limits, bcrypt, JWT + sessions, RBAC, ownership guards |
| Users | Profiles, profile image, change password, deletion requests, suspend/deactivate by admin |
| Taxonomy | Dynamic categories with typed attribute schemas, dynamic amenities, admin management |
| Properties | Independent listings, multi-category attributes, pricing per rental period, instant/request booking config, media (≤10 images), duplicate flags, approval workflow, change requests, archive/soft delete |
| Availability | Date-level reservation ledger, owner blocks, atomic overlap prevention, availability cache |
| Bookings | Both modes, server-side pricing, snapshots, controlled state machine, cancellation requests, admin booking management, history |
| Discovery | Filter/search/sort/pagination, GeoJSON `2dsphere` map search, favorites |
| Communication | In-app notifications, email via provider abstraction/templates, event-driven triggers |
| Admin | User/property/booking/deletion management, settings, audit logs, reports (basic) |
| Ops | Health checks, structured logs, error tracking extension, indexes, seeds, migrations, tests |
| Payments | **External/manual only**; booking has future-compatible `payment` reference |
| Not in V1 | Reviews, online payments, verification, managers, messaging, SMS/push, subscriptions, advanced pricing, advanced search engine, caching layer, 2FA |

## 2. Version 2 — high-probability extensions

| Feature | Module / extension point | V1 provision | Work required in V2 |
|---|---|---|---|
| Owner identity/CNIC verification | new `ownerVerifications` module | `users.verification`, role permissions stable | New collection, admin review UI, verified badge derived field |
| Verified-owner badge | `users` derived field + search projection | no badge logic in V1 | Add optional `trustBadge` field, display rule |
| Property managers/agents | new `propertyAssignments`/delegation module | `authorize()` + properties service ownership resolver | Scoped permissions, assignment collection, no controller rewrites |
| Parent buildings and child units | properties module | `parentPropertyId` nullable, listings independent | Add hierarchy service, inheritance rules, migration for grouping |
| Property portfolios | new `portfolios` module | ownerId + parentPropertyId reserved | Portfolio collection, permission checks |
| Videos/floor plans/tours/documents | media module | `resourceType` enum already generic | Provider config, upload UI, media limits per type |
| Advanced availability calendars | bookings availability service | `availabilityReservations.source` extensible | Recurring blocks, seasonal windows, ical sync |
| Booking holds + auto-expiry | bookings policy + jobs | `expiresAt`, `expired` status, job scaffold | Hold reservations with TTL, expiry job, policy config |
| Booking modifications/extensions | booking service + history | `bookingHistory`, transaction patterns | Modification records, reprice, reservation swap |
| Advanced cancellation policies | `policy.service.js` | Central policy interface with default rules | Policy collection/rule engine, per-property policy id |
| Seasonal/discount pricing | `pricing.service.js` → `pricingRules` module | `pricing` object, `priceSnapshot.calculationVersion` | New collections, rule evaluation, quote versioning |
| Deposits, cleaning fees, taxes | same pricing extension | `depositMinor`, `additionalCharges`, `taxConfig` reserved | Enable fields, update calculation, preserve snapshots |
| Online payments | new `payments` module | `bookings.payment` reference, events, no logic in booking controller | Gateway adapters, webhooks, reconciliation job, payment events |
| Refunds/invoices/payouts/commissions | finance modules | Booking ids + immutable snapshots | Ledger, invoices, refund records, commission settings |
| Reviews and ratings | new `reviews` module | No review fields on `properties` | Eligibility service checks completed bookings, moderation workflow |
| In-app messaging | new `conversations`/`messages` modules | Booking/property ids stable | Conversation anchor, file attachments via media |
| SMS/push/WhatsApp | notification channel adapters | `NotificationChannel` interface + events | New adapters + preferences |
| Notification preferences | `notificationPreferences` module | `users.preferences` reserved | Per-channel/user/type rules |
| Multi-currency display + FX | money service + settings | Integer minor units + currency everywhere | FX rate provider, display conversion, booking currency frozen |
| Multi-country expansion | settings + taxonomy data | Country fields, categories data-driven | Localization, region-specific settings |
| Caching | `CacheProvider` no-op adapter | Interface reserved | Redis, cache invalidation on events |

## 3. Version 3 — scaling and business expansion

| Feature | Extension point | Notes |
|---|---|---|
| Advanced search engine | `PropertySearchRepository` interface | Swap MongoDB implementation for Elasticsearch/Typesense; keep `/search` contract |
| Microservice extraction | Module public interfaces + events | Extract `bookings` or `notifications` first; replace in-process calls with HTTP/gRPC adapters |
| Subscription plans / featured listings | new `subscriptions`, `promotions` modules | `settings` feature flags, audit, no changes to core property schema |
| Advertising and rate optimization | new modules + analytics events | Event payloads already carry IDs/actors |
| Advanced analytics/reporting | audit + booking history + read models | Dedicated reporting database/projections; no OLTP query overload |
| 2FA and device management | auth module + sessions | JWT step-up claims, `userDevices`, session metadata |
| Granular role/permission UI | permission registry + `user.extraPermissions` | Scoped grants for managers/agents |
| Mobile application APIs | `/api/v2` adapters | Same services, mobile-specific response shapes |
| Recurring bookings and reminders | booking state machine + jobs | New states via controlled enum migration |
| Property maintenance/document workflows | new module | Optional fields on `properties`, references to media/documents |

## 4. Future/uncommitted

- Fraud detection and risk scoring on bookings/listings.
- Owner payout scheduling and tax document generation.
- Multi-tenant partners/white-label portals.
- AI-assisted descriptions/categorization and duplicate detection.
- Public API/partner integrations with API keys and scopes.
- Blockchain-backed identity or contract records (only if a real requirement appears).

## 5. Compatibility guardrails carried from V1

1. Stable ObjectId references; no field renaming without migration.
2. Snapshots on properties and bookings make history independent of later edits.
3. Separate status dimensions prevent a future feature from overloading one field.
4. Provider interfaces keep external vendors out of business logic.
5. Event contracts allow new subscribers without changing publishers.
6. Money as integer minor units + currency; no symbol assumptions.
7. Dynamic categories/amenities are data, not code.
8. `schemaVersion` markers and migration scripts support backward-compatible evolution.
9. `/api/v1` and `/api/v2` can coexist against the same database during transition.
10. Ownership and permissions are centralized, so delegated access is a configuration/data change.

## 6. Deliberate non-goals for V1

- No microservices, Kubernetes, Elasticsearch, Redis, or event streaming cluster.
- No empty placeholder collections for every imagined feature (except explicitly justified fields like `payment` and `verification`).
- No implementation of payments, reviews, verification, messaging, subscriptions, or 2FA.
- No automatic rejection of duplicate listings or hard deletion of historical data.
