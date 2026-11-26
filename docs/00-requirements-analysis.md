# Document 0 — Requirements Analysis (Phase 1)

## 1. Confirmed requirements

### 1.1 Product and scope

- MERN stack: Node.js, Express.js, MongoDB, Mongoose, React-compatible REST API.
- Modular monolith now; independently extractable modules later.
- API base path `/api/v1`; future breaking versions at `/api/v2`.
- Multi-category rental platform: residential, commercial, hospitality, industrial, land. No house-only assumptions.
- Dynamic, admin-managed categories with structured, validated category-specific attributes.
- Every rentable unit is an independent listing (no parent/child in V1).
- Three account types: customer, property owner, admin. Customer and owner are separate account types; a customer cannot act as an owner by default.
- One owner account may own many properties.
- Admin accounts are created only by existing admins.
- Owner verification, CNIC/document checks, and verified badges are future, not V1.
- Payments are handled outside the platform in V1; booking model must be payment-ready.
- Reviews/ratings are future, not V1.
- Online payment, messaging, SMS, push, subscriptions, multi-country/multi-currency, and advanced analytics are future.

### 1.2 Auth and security

- JWT access + refresh tokens, bcrypt password hashing, secure session/token management.
- Forgot password and secure email-based reset.
- Logout with token invalidation.
- Rate limiting and brute-force protection.
- Centralized RBAC plus resource ownership checks.
- No password hashes, refresh tokens, reset tokens, or sensitive internal data in responses.
- Extensible to 2FA, login history, device/session management, and email verification.

### 1.3 Property

- Separate status dimensions: `listingStatus` (draft/published/archived), `approvalStatus` (pending/approved/rejected), `availabilityStatus` (available/booked/unavailable).
- All new properties require admin approval before public visibility.
- Rejected listings stay editable and resubmittable by the owner.
- Multiple concurrent submissions per owner are allowed.
- Approval history stored.
- Direct owner edits only when there is no active confirmed booking. Otherwise a `propertyChangeRequests` record is created and admin-approved before application.
- Owners can archive available properties; archiving/deleting a booked property requires admin approval.
- Soft delete/archive is default; historical bookings must survive.
- Duplicate detection flags possible duplicates for admin review; no automatic rejection; no unique address constraint.

### 1.4 Media

- Up to 10 images per property by default (configurable), one cover image, add/remove/reorder.
- Store URLs and provider identifiers, never binary data in MongoDB.
- Storage abstraction (Cloudinary-compatible), provider replaceable.
- Safe cleanup for removed media; future videos, floor plans, tours, documents.

### 1.5 Pricing and booking

- Owner-defined base rates per permitted rental period: daily, weekly, monthly, yearly, custom.
- Backend calculates and validates all amounts; frontend prices are never trusted.
- Booking price snapshot with currency, rate used, calculation detail, and timestamp.
- Currency configurable, not hardcoded throughout code.
- Two booking modes: instant (auto-confirm) and request (pending → owner/admin decision).
- Controlled booking state machine: pending, confirmed, rejected, cancellation_requested, cancelled, completed, expired.
- No overlapping confirmed bookings; concurrency-safe backend enforcement (transaction/atomic strategy).
- Clear date boundary rule.
- Cancellation is a reviewed workflow with reason, requester, reviewer, timestamp, and history.
- Admin booking management: list, create for a customer, approve, reject, cancel, modify dates, complete, view history; all admin actions audited.

### 1.6 Search, favorites, amenities, notifications

- Search by location (country/state/city/area), category, price range, rental period, availability, bedrooms, bathrooms, furnishing, amenities, category attributes; sorting, pagination, GeoJSON `2dsphere`.
- Favorites with unique customer+property constraint.
- Admin-managed amenities, activated/deactivated without destroying historical property data.
- Notification service generating both email and in-app notifications from business events; email templates separated; future channels/pluggable providers.

### 1.7 Lifecycle, audit, operations

- Account deletion requests with admin approve/reject/direct delete, suspension/deactivation; active-booking checks; preserve history; soft delete/anonymization.
- Append-only/admin-protected audit logs for sensitive admin actions.
- Background job layer for email, reminders, session cleanup, booking expiry, orphaned media, reports.
- Testing strategy: unit, integration, e2e covering the listed critical journeys.
- Logging, monitoring, error tracking, backups, indexes, pagination, and documented scaling bottlenecks.

## 2. Future requirements (explicitly out of V1 scope)

| Area | Future capability | Required extension point in V1 |
|---|---|---|
| Owner | Identity/CNIC verification, verified badges | `users.verification` placeholder object; separate `ownerVerifications` module later |
| Owner | Managers, agents, delegated permissions | `propertyAssignments` module + permission service; property owner ref stays stable |
| Property | Parent buildings/units, portfolios | `parentPropertyId` nullable field reserved on `properties`; no V1 logic |
| Property | Videos, floor plans, tours, documents | `media.resourceType` already generic |
| Property | Advanced availability/seasonal blocks | Reservations collection with `source` field |
| Booking | Extensions, modifications, recurring, reminders, expiry | Booking service state machine + `bookingHistory` + jobs layer |
| Pricing | Seasonal rules, discounts, codes, fees, deposits, taxes | `pricing` object + `pricingRules` module later; booking `priceSnapshot` |
| Finance | Payments, refunds, invoices, payouts, commissions | Booking `payment` reference object only; future `payments` module + events |
| Communication | Messaging, SMS, push, WhatsApp, preferences | Notification event contracts + provider adapters + future `notificationPreferences` |
| Business | Subscriptions, featured listings, ads, analytics | `settings`, `listingPromotion` future module, audit/events |
| Platform | 2FA, granular permissions, search engine, cache, API integrations | Auth step-up design, permission registry, search repository interface, cache interface |

## 3. Deferred decisions (approved V1 defaults)

| # | Ambiguity | Why it matters | Recommended V1 default |
|---|---|---|---|
| D1 | Check-out day vs next check-in day | Drives reservation keys and overlap rules | **Allowed**: checkout day is not locked; a new booking may start the same calendar day |
| D2 | Do pending request-bookings hold dates? | Affects concurrency and owner approval UX | **No hold in V1**; re-check availability atomically at approval; 409 if conflict. Hold/expiry is V2 |
| D3 | Admin-created property needs an owner | Properties require an owner reference | Admin selects an existing owner account; admin-created listings also start `pending` unless the admin records a real approval action |
| D4 | Owner cancellation policy | Requirement says "according to business rules" but no policy defined | Owner may cancel confirmed bookings with a reason; customer requests are never auto-approved; admin can cancel anytime. Policy engine is a V1 interface with default rules |
| D5 | Same email for customer + owner account | Separate account types vs one identity | One email = one account with one role in V1; same person may register a second account with a different email. Multi-role is a V2 data/config change |
| D6 | Default currency and multi-currency | Must avoid hardcoded symbols | `currency` stored per property with default from `settings` (recommend `PKR` as seed default); V1 has no FX conversion; `priceSnapshot.currency` preserved |
| D7 | Email verification required before use | Affects auth flow and booking eligibility | Deferred: accounts usable immediately; `emailVerifiedAt` field reserved; recommended to enable before public launch as a config flag |
| D8 | Pending booking expiry | Status `expired` exists but no rule given | No automatic expiry in V1; background job scaffold added; expiry policy configurable in V2 |
| D9 | Retention period for deleted/anonymized users | Legal/compliance decision | Soft-delete/anonymize indefinitely by default; retention policy in `settings` and future purge job |
| D10 | Permanent property deletion | Conflicts with historical preservation | Blocked when any booking/audit reference exists; otherwise admin-only soft delete with `deletedAt` |
| D11 | Guest count required | Only "if applicable" | Optional; properties declare `maxGuests`; booking validates only when property requires it |
| D12 | Location input | GeoJSON required but no source | V1 accepts lat/lng from owner/admin form; future geocoding adapter can populate it |

## 4. Technical assumptions

- MongoDB **6+ replica set** so multi-document ACID transactions are available for booking confirmation and change application. Standalone development may run without transactions via a tested fallback flag, but production assumes replica set.
- Mongoose 8+, Node.js LTS, Zod for request/schema validation (chosen for reuse with dynamic category attributes), pino-style structured JSON logging.
- JWT access tokens are short-lived; refresh tokens are opaque random values stored **hashed** in `sessions`; refresh rotation is designed for from day one.
- All money values are stored as **integer minor units** (e.g., paisa/cents) plus `currency`; never floating point.
- Dates in booking APIs are ISO `YYYY-MM-DD` calendar dates normalized to UTC midnight internally; time-of-day/timezone can be added later without renaming fields.
- Public visibility rule: `listingStatus = published`, `approvalStatus = approved`, no `deletedAt`, owner active.
- In-app notifications are written synchronously in the domain transaction or via outbox; email is always asynchronous via outbox/worker.
- V1 single deployment of the modular monolith; horizontal scaling of app processes is supported by stateless design, with Redis adapters deferred for rate limiting/job queues.

## 5. Conflicts / tensions identified (not silently resolved)

1. **"Admin can create properties" vs "every property has an owner"** → resolved as D3; approved V1 default.
2. **"Owner can cancel bookings" vs "no cancellation policy defined"** → resolved as D4; approved V1 default.
3. **"Booked properties remain visible but must not accept conflicting bookings" vs "availabilityStatus as a status dimension"** → `availabilityStatus` is a cached projection of real reservation data, not the source of truth. Search filters must query reservations, not the cache.
4. **"Every new property requires approval" vs "admin can create/edit properties"** → admin actions are themselves audited and may include an explicit approval; no implicit bypass flag is designed.
5. **"Separate customer and owner account types" vs future "owner managers/delegated permissions"** → single-role invariant in V1 is data-level, not schema-level; roles array avoids a future collection split.
6. **"Do not implement future features" vs "email service for auth"** → email is V1 infrastructure for reset/notifications; provider abstraction is required now, templates are V1-simple.
7. **"Flexible dynamic attributes" vs "validated, not arbitrary"** → attributes are stored as typed key/value records validated against a category schema; free-form objects are rejected.

## 6. Phase gates

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Requirements analysis | Complete (this document) |
| 2 | System architecture | Complete (`01-system-architecture.md`) |
| 3 | Database architecture + ER diagram | Complete (`02`, `03`) |
| 4 | Workflow/state design | Complete (`06`) |
| 5 | API + permission blueprint | Complete (`04`, `05`) |
| 6 | Future compatibility review | Complete (`08`) |
| 7 | Final approval | ✅ Approved |
| 8 | Backend implementation | ✅ Core complete; hardening in progress |

V1 backend implementation follows the approved design in `backend/`.
