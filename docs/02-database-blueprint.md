# Document 2 — Database Blueprint (Phase 3)

## 1. Conventions

- All `_id` fields are MongoDB `ObjectId`. References store `ObjectId` unless explicitly noted.
- Timestamps are UTC `Date` objects; public API serializes ISO-8601.
- **Money is always an integer in minor units** (`amountMinor`), paired with an ISO-4217 `currency` string. No floats, no currency symbols in code.
- Booking dates are ISO `YYYY-MM-DD` at the API boundary and stored as `Date` at UTC midnight (`checkInDate`, `checkOutDate`), representing calendar dates.
- Mongoose `select: false` on `passwordHash`, `refreshTokenHash`, `tokenHash`, and reset tokens.
- Output DTOs are explicit whitelists; never `res.json(document)` for users/sessions.
- `required` below means required at the service/validation layer; Mongoose schema rules mirror it.
- Soft deletion uses `deletedAt` (and `deletedBy`/`deleteReason` where relevant). Hard deletes are exceptions documented per collection.

## 2. Collection inventory

| # | Collection | Owner module | Purpose | Future collections (not created now) |
|---|---|---|---|---|
| 1 | `users` | users | Accounts, profiles, roles, lifecycle state | `ownerVerifications`, `userDevices` |
| 2 | `sessions` | auth | Refresh tokens / sessions | `loginHistory` |
| 3 | `passwordResetTokens` | auth | Email reset token state | `verificationTokens` |
| 4 | `propertyCategories` | categories | Dynamic categories + attribute schemas | — |
| 5 | `amenities` | amenities | Dynamic amenity catalog | — |
| 6 | `properties` | properties | Rental listings | `propertyPortfolios` |
| 7 | `media` | media | External media records | — |
| 8 | `approvalHistory` | properties | Property approval lifecycle history | — |
| 9 | `propertyChangeRequests` | properties | Edits requiring admin approval | — |
| 10 | `duplicateFlags` | properties | Suspected duplicates for review | — |
| 11 | `bookings` | bookings | Booking records + snapshots | `payments`, `invoices`, `refunds` |
| 12 | `availabilityReservations` | bookings | Atomic date-level occupancy locks | `availabilityCalendars` |
| 13 | `bookingHistory` | bookings | Booking status transition history | — |
| 14 | `favorites` | favorites | Customer wishlist | — |
| 15 | `notifications` | notifications | In-app notification store | `notificationPreferences` |
| 16 | `deletionRequests` | users | Account deletion workflow | — |
| 17 | `auditLogs` | auditLogs | Append-only admin action log | archived log collections |
| 18 | `settings` | admin | Platform configuration/key-value | — |
| 19 | `eventOutbox` | infrastructure/events | Reliable event delivery | — |

Additional collections are deliberate: `availabilityReservations` provides atomic overlap prevention; `approvalHistory`/`bookingHistory` preserve independent lifecycles; `media` supports future resource types; `eventOutbox` prevents lost notifications; `deletionRequests` implements the required workflow; `settings` and `passwordResetTokens` avoid hardcoding policies/secrets in code.

---

## 3. Collection definitions

### 3.1 `users`

Purpose: all accounts (customer, owner, admin) with stable IDs used by historical records.

| Field | Type | Req | Default | Validation / notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | Stable identifier |
| `roles` | `[String]` enum `customer\|owner\|admin` | yes | `['customer']` | V1 invariant: exactly one role. Array chosen for V2 multi-role without collection split |
| `accountStatus` | String enum `active\|suspended\|deactivated\|pending_deletion\|deleted` | yes | `active` | Controlled by users/admin services only |
| `fullName` | String | yes | — | trim, 2–100 chars |
| `email` | String | yes | — | lowercase, RFC-ish email, unique |
| `emailVerifiedAt` | Date \| null | no | `null` | Reserved; V1 does not block usage |
| `passwordHash` | String | yes | — | bcrypt, `select:false`, never serialized |
| `phone` | String \| null | no | `null` | E.164-like pattern; indexed, **not unique** in V1 (verification later) |
| `profileMediaId` | ObjectId ref `media` \| null | no | `null` | Optional profile image; media record uses `attachedTo.type = 'user'` |
| `tokenVersion` | Number int | yes | `0` | Increment revokes all access/refresh tokens |
| `failedLoginAttempts` | Number int | yes | `0` | Reset on success; drives lockout |
| `lockedUntil` | Date \| null | no | `null` | Brute-force protection |
| `lastLoginAt` | Date \| null | no | `null` | Future login-history anchor |
| `verification` | Object | no | `{ status:'none' }` | Reserved future: `{status:'none\|pending\|verified', requestedAt, verifiedAt, provider}`; no V1 workflow |
| `preferences` | Object | no | `{}` | Reserved for future notification/locale preferences |
| `deletion` | Object | no | `{}` | `{requestedAt, completedAt, anonymizedAt}` |
| `schemaVersion` | Number int | yes | `1` | Migration marker |
| `createdAt`, `updatedAt` | Date | yes | auto | Timestamps |
| `deletedAt` | Date \| null | no | `null` | Soft delete tombstone |

Embedded vs referenced: profile image is a reference; status/security counters are embedded small tightly coupled values.

Indexes:
- `{ email: 1 }` **unique** — login, duplicate registration prevention.
- `{ roles: 1, accountStatus: 1 }` — admin user lists and role-filtered queries.
- `{ phone: 1 }` sparse — admin/support lookup.
- `{ accountStatus: 1, createdAt: -1 }` — admin management lists.
- `{ deletedAt: 1 }` sparse — tombstone cleanup/reporting.

Query patterns: login by email; current user by id; admin list by role/status; owner/customer lookup for reference resolution; active-booking check during deletion.

Deletion/archival: never hard-delete while any booking, audit, or change-request reference exists. On approved deletion: `accountStatus = deleted`, `deletedAt`, `email` rewritten to a tombstone value (e.g., `deleted+<id>@invalid.example`), `passwordHash` cleared, optional PII anonymized; `tokenVersion++`; all sessions revoked. Bookings keep their own snapshots so they remain understandable.

Future extension: `verification` grows into `ownerVerifications` module; `preferences` into `notificationPreferences`; `roles` may contain multiple values; `accountStatus` gains states via controlled migration.

---

### 3.2 `sessions`

Purpose: secure refresh-token/session management and revocation.

| Field | Type | Req | Default | Validation / notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | Session id used as JWT `sid` |
| `userId` | ObjectId ref `users` | yes | — | Indexed |
| `refreshTokenHash` | String | yes | — | SHA-256 of opaque token, unique, `select:false` |
| `familyId` | ObjectId | yes | auto | Rotation family; reuse detection revokes family |
| `expiresAt` | Date | yes | — | TTL target |
| `revokedAt` | Date \| null | no | `null` | Logout/reuse/password change |
| `replacedById` | ObjectId \| null | no | `null` | Rotation chain |
| `lastUsedAt` | Date \| null | no | `null` | Security visibility |
| `ip`, `userAgent` | String \| null | no | `null` | Request metadata, sanitized |
| `createdAt`, `updatedAt` | Date | yes | auto | Timestamps |

Indexes:
- `{ refreshTokenHash: 1 }` **unique** — token lookup.
- `{ userId: 1, revokedAt: 1 }` — list active sessions, bulk revoke.
- `{ familyId: 1 }` — reuse detection.
- `{ expiresAt: 1 }` **TTL** — automatic cleanup.

Deletion: TTL removal of expired sessions; explicit revoke sets `revokedAt`. No business history depends on sessions.

Future: device names, 2FA step-up marker, geolocation, login history derived from session events.

---

### 3.3 `passwordResetTokens`

Purpose: single-use, expiring password reset links.

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | — |
| `userId` | ObjectId ref `users` | yes | — | Indexed |
| `tokenHash` | String | yes | — | unique, `select:false`; raw token emailed only |
| `expiresAt` | Date | yes | — | Short TTL (e.g., 30 min via config) |
| `usedAt` | Date \| null | no | `null` | Single-use enforcement |
| `requestedIp` | String \| null | no | `null` | Security metadata |
| `createdAt` | Date | yes | auto | — |

Indexes: `{ tokenHash:1 }` unique; `{ expiresAt:1 }` TTL; `{ userId:1, createdAt:-1 }`.

Deletion: TTL handles expiry; on use set `usedAt` and revoke all sessions plus `tokenVersion++`.

---

### 3.4 `propertyCategories`

Purpose: dynamic category registry and **structured** attribute schemas. No hardcoded category list in code.

| Field | Type | Req | Default | Validation / notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | Referenced by properties |
| `code` | String | yes | — | lowercase slug, unique, e.g. `house`, `commercial_plot` |
| `name` | String | yes | — | Display name |
| `group` | String enum `residential\|commercial\|hospitality\|industrial\|land\|other` | yes | — | Top-level grouping |
| `parentId` | ObjectId ref `propertyCategories` \| null | no | `null` | Reserved for subcategories; no V1 logic |
| `description`, `icon` | String \| null | no | `null` | Display metadata |
| `isActive` | Boolean | yes | `true` | Deactivation hides from new selection only |
| `sortOrder` | Number int | yes | `0` | Display ordering |
| `allowedRentalPeriods` | `[String]` enum `daily\|weekly\|monthly\|yearly\|custom` | yes | `['monthly']` | Category-level defaults; owner can choose subset |
| `attributeSchema` | `[AttributeDefinition]` | no | `[]` | See below |
| `attributeSchemaVersion` | Number int | yes | `1` | Bump on schema change; copied into property attribute values |
| `createdBy` | ObjectId ref `users` | yes | — | Admin actor |
| `createdAt`, `updatedAt` | Date | yes | auto | — |
| `deletedAt` | Date \| null | no | `null` | Soft delete |

`AttributeDefinition` (embedded, bounded by admin configuration):

| Field | Type | Notes |
|---|---|---|
| `key` | String | stable slug, unique within category, e.g. `bedrooms` |
| `label` | String | display label |
| `dataType` | enum `string\|number\|integer\|boolean\|enum\|multiEnum\|date` | drives validation and storage slot |
| `required` | Boolean | required when category selected |
| `unit` | String \| null | e.g. `sqft`, ` acre` |
| `options` | `[{value,label}]` | required for `enum`/`multiEnum` |
| `min`, `max`, `minLength`, `maxLength`, `pattern` | Number/String | conditional validation |
| `defaultValue` | Mixed \| null | safe default |
| `searchable`, `filterable` | Boolean | promotes value into search facet logic |
| `displayOrder` | Number | UI ordering |
| `deprecated` | Boolean | keep old values readable; block new writes |
| `description` | String \| null | help text |

Seed categories: House, Apartment, Villa, Room; Office, Shop, Commercial building; Hotel, Hostel, Guest house; Factory, Warehouse; Agricultural land, Residential plot, Commercial plot. With representative attribute schemas (bedrooms/bathrooms/floors/parking/furnishing; floorNumber/officeArea/meetingRooms; landArea/landUnit/landType/roadAccess; roomType/guestCapacity/bedCount/facilities).

Indexes:
- `{ code:1 }` **unique** — category lookup by slug.
- `{ group:1, isActive:1, sortOrder:1 }` — public category navigation.
- `{ parentId:1 }` — future subcategory tree.
- `{ isActive:1 }` — admin filters.

Deletion: soft delete/deactivate; existing properties keep `categoryId` and a category snapshot in `properties.categorySnapshot` so historical display survives. Never cascade-delete properties.

Future: new categories and subcategories are pure data + attribute schema changes; no core property schema rewrite.

---

### 3.5 `amenities`

Purpose: admin-managed amenity catalog, optionally associated with categories.

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | — |
| `code` | String | yes | — | unique slug (`wifi`, `parking`, `air_conditioning`, …) |
| `name`, `description`, `icon` | String | partially | — | name required |
| `isActive` | Boolean | yes | `true` | Deactivate hides from new selection |
| `categoryIds` | `[ObjectId]` | no | `[]` | Which categories may use it |
| `sortOrder` | Number | yes | `0` | — |
| `createdBy` | ObjectId ref `users` | yes | — | Admin |
| `createdAt`, `updatedAt` | Date | yes | auto | — |
| `deletedAt` | Date \| null | no | `null` | Soft delete |

Indexes: `{code:1}` unique; `{isActive:1, sortOrder:1}`; `{categoryIds:1}`.

Deletion: soft only. Properties store both amenity IDs and an `amenitySnapshot` so deactivation/renaming never changes historical listing meaning.

---

### 3.6 `properties`

Purpose: one document per independent rentable unit.

| Field | Type | Req | Default | Validation / notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | Stable listing id |
| `title` | String | yes | — | 5–150 chars, trimmed |
| `description` | String | yes | — | max e.g. 10,000 chars |
| `ownerId` | ObjectId ref `users` | yes | — | Owner role enforced in service |
| `ownerSnapshot` | Object | yes | — | `{id, fullName}` at creation, for history |
| `categoryId` | ObjectId ref `propertyCategories` | yes | — | Active category required |
| `subcategoryId` | ObjectId ref `propertyCategories` \| null | no | `null` | Future/subcategory support |
| `categorySnapshot` | Object | yes | — | `{code, name, group, attributeSchemaVersion}` |
| `address` | Object | yes | — | See below |
| `location` | GeoJSON Point | no | `null` | `{type:'Point', coordinates:[lng,lat]}`, validated −180..180 / −90..90 |
| `attributes` | `[AttributeValue]` | no | `[]` | Structured typed values; see below |
| `amenities` | `[ObjectId]` ref `amenities` | no | `[]` | Validated against activated amenities |
| `amenitySnapshot` | `[{id, code, name}]` | no | `[]` | Historical preservation |
| `pricing` | Object | yes | — | See below |
| `rentalPeriods` | `[String]` enum | yes | category defaults | Subset of category allowed periods |
| `bookingConfig` | Object | yes | — | See below |
| `availability` | Object | yes | — | See below |
| `media` | Object | yes | `{coverMediaId:null, imageCount:0, maxImages:10}` | `maxImages` from settings |
| `listingStatus` | String enum `draft\|published\|archived` | yes | `draft` | Independent dimension |
| `approvalStatus` | String enum `pending\|approved\|rejected` | yes | `pending` | Independent dimension |
| `submittedAt`, `approvedAt`, `rejectedAt`, `archivedAt` | Date \| null | no | `null` | Lifecycle timestamps |
| `approvedBy`, `rejectedBy`, `archivedBy` | ObjectId ref `users` \| null | no | `null` | Admin actors |
| `approvalReason` | String \| null | no | `null` | Rejection reason |
| `changeRequestVersion` | Number int | yes | `0` | Incremented when a change request is applied |
| `parentPropertyId` | ObjectId ref `properties` \| null | no | `null` | Reserved for future buildings/units |
| `duplicateScore` | Number 0..1 \| null | no | `null` | Last computed detection score |
| `searchKeywords` | `[String]` | no | `[]` | Normalized text for text search |
| `deletedAt`, `deletedBy`, `deleteReason` | Date/ObjectId/String \| null | no | `null` | Soft deletion |
| `schemaVersion` | Number int | yes | `1` | Migration marker |
| `createdAt`, `updatedAt` | Date | yes | auto | — |

**`address` embedded object**: `{ country, stateProvince, city, area, street, unitNumber, fullAddress, postalCode }` — all String, `country/city/street` required, others optional. Small and always read with the listing, so embedded. `unitNumber` participates in duplicate detection, never as a unique key.

**`AttributeValue` embedded object**: `{ key, dataType, stringValue, numberValue, booleanValue, dateValue, arrayValue, unit, categoryId, schemaVersion }`. Only the slot matching `dataType` is populated. Validated by `categories.validateAttributes(categoryId, attributes)`: unknown keys, wrong types, missing required fields, out-of-range values, and invalid enum values are rejected. This is a structured, typed system — not a free-form object.

**`pricing` embedded object**:

| Field | Type | Notes |
|---|---|---|
| `currency` | String (ISO-4217) | From settings/default, locked per listing |
| `defaultPeriod` | String enum | One of `rentalPeriods` |
| `rates` | `[{ period, amountMinor, label? }]` | One rate per allowed period; required for each allowed period |
| `requiresDeposit` | Boolean | default `false`, V2 hook |
| `depositMinor` | Number \| null | default `null`, no V1 logic |
| `additionalCharges` | Array | default `[]`, V2 hook (cleaning/service fees) |
| `taxConfig` | Object \| null | default `null`, V2 hook |
| `version` | Number | increments on price change |
| `updatedAt` | Date | — |

**`bookingConfig` embedded object**: `{ mode: 'instant'|'request', minUnits, maxUnits, requireGuestCount, maxGuests, sameDayCheckInAllowed, cancellationPolicyId:null, autoExpireMinutes:null, bookingWindowDays }`. All rules evaluated server-side.

**`availability` embedded object**: `{ isOpenForBooking: Boolean (true), leadTimeDays: Number (0), maxAdvanceDays: Number (365), status: enum available|booked|unavailable (cached), statusCalculatedAt: Date|null, note: String|null }`. Owner-controlled flag plus system-derived occupancy; the source of truth for overlaps is `availabilityReservations`, not this cache.

Indexes and purpose:

| Index | Supports |
|---|---|
| `{ ownerId:1, createdAt:-1 }` | Owner "my properties" dashboard |
| `{ listingStatus:1, approvalStatus:1, createdAt:-1 }` | Public approved-published feed and admin queues |
| `{ categoryId:1, listingStatus:1, approvalStatus:1 }` | Category browse + filters |
| `{ location:'2dsphere' }` | `$near`, `$geoWithin`, map search |
| `{ 'address.country':1, 'address.stateProvince':1, 'address.city':1 }` | Location filters |
| `{ 'attributes.key':1, 'attributes.numberValue':1 }` | Numeric attribute filters (`bedrooms >= 2`) |
| `{ 'attributes.key':1, 'attributes.stringValue':1 }` | Enum/string attribute filters |
| `{ 'pricing.rates.period':1, 'pricing.rates.amountMinor':1 }` | Price-range filtering by period |
| `{ searchKeywords:'text', title:'text', description:'text' }` | Keyword search |
| `{ approvalStatus:1, submittedAt:1 }` sparse | Admin pending queue oldest-first |
| `{ parentPropertyId:1 }` sparse | Future unit grouping |
| `{ deletedAt:1 }` sparse | Tombstone/cleanup queries |

Multikey attribute indexes are bounded by the attribute count per listing (typically < 25); if growth makes them costly, move filters into a dedicated search projection collection without changing the core document.

Query patterns: public search/filter/sort/pagination; map bounding-box search; owner dashboard; admin pending/rejected queues; availability recheck by id; duplicate candidate scans; archive/soft-delete checks.

Deletion/archival: default soft archive (`listingStatus='archived'`, `archivedAt`). Permanent delete only when no bookings/change requests/audit references exist; even then keep a tombstone id. Owner archive blocked when active confirmed bookings exist (D10). Historical bookings use snapshots, so edits/deletion cannot rewrite them.

Future: `parentPropertyId`, `verificationBadgeId`, promotion fields (`featuredUntil`), `maintenance` state, and richer availability can be added as optional fields with default `null`/`false`.

---

### 3.7 `media`

Purpose: provider-agnostic media metadata; no binary data in MongoDB.

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | Cover reference target |
| `attachedTo` | Object `{type: enum property\|user, id: ObjectId}` | yes | — | Polymorphic owner; indexed |
| `provider` | String enum `cloudinary\|s3\|…` | yes | `cloudinary` | Adapter discriminator |
| `providerPublicId` | String | yes | — | Provider-side identifier for deletion |
| `url`, `secureUrl` | String | yes | — | External URLs |
| `resourceType` | String enum `image\|video\|floorplan\|document\|tour\|360` | yes | `image` | Future-ready |
| `mimeType`, `format` | String | yes | — | Validated allowlist |
| `bytes`, `width`, `height` | Number | no | `null` | Metadata |
| `alt` | String | no | `null` | Accessibility |
| `displayOrder` | Number int | yes | `0` | Reordering |
| `isCover` | Boolean | yes | `false` | Single cover enforced in service |
| `status` | String enum `active\|pending_delete\|deleted` | yes | `active` | Safe cleanup workflow |
| `uploadedBy` | ObjectId ref `users` | yes | — | Actor |
| `createdAt`, `updatedAt` | Date | yes | auto | — |

Indexes: `{ 'attachedTo.type':1, 'attachedTo.id':1, displayOrder:1 }` — listing media ordered; `{ provider:1, providerPublicId:1 }` unique — provider lookup/safe delete; `{ status:1, createdAt:1 }` — orphan cleanup job; `{ isCover:1 }` sparse — cover lookup (uniqueness enforced by service transaction).

Deletion: `removeMedia` sets `pending_delete`, emits `MediaCleanupRequested`; worker deletes from provider and then sets `deleted` or removes the record. Never delete a provider asset still referenced as a cover. `imageCount` on the property is capped by `settings.maxImagesPerProperty` (default 10).

---

### 3.8 `approvalHistory`

Purpose: immutable per-property approval trail.

| Field | Type | Req | Notes |
|---|---|---|---|
| `_id` | ObjectId | yes | — |
| `propertyId` | ObjectId ref `properties` | yes | Indexed |
| `action` | String enum `submit\|approve\|reject\|resubmit` | yes | — |
| `fromStatus`, `toStatus` | String enum | yes | Approval statuses |
| `actorId`, `actorRole` | ObjectId/String | yes | Owner/admin |
| `reason` | String \| null | no | Required for reject |
| `snapshot` | Object \| null | no | Small version snapshot at decision |
| `createdAt` | Date | yes | — |

Indexes: `{ propertyId:1, createdAt:-1 }`; `{ actorId:1, createdAt:-1 }`. Never modified or deleted; future retention archive only.

---

### 3.9 `propertyChangeRequests`

Purpose: owner edit proposals for properties with active confirmed bookings; admin applies safely.

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | — |
| `propertyId` | ObjectId ref `properties` | yes | — | Indexed |
| `ownerId` | ObjectId ref `users` | yes | — | Indexed |
| `status` | String enum `pending\|approved\|rejected\|withdrawn\|expired` | yes | `pending` | — |
| `reason` | String | no | `null` | Owner explanation |
| `requestedChanges` | Object | yes | — | **Whitelisted** patch: title, description, address, attributes, amenities, pricing, bookingConfig, media ordering; never status/owner/approval fields |
| `currentSnapshot` | Object | yes | — | Full safe property snapshot at request time |
| `proposedSnapshot` | Object | yes | — | Resulting document preview |
| `changeSummary` | Array `{field, before, after}` | no | `[]` | Safe diff, no secrets |
| `review` | Object | no | `null` | `{reviewedBy, reviewedAt, reason, note}` |
| `appliedAt` | Date \| null | no | `null` | — |
| `appliedVersion` | Number \| null | no | `null` | Property `changeRequestVersion` |
| `createdAt`, `updatedAt` | Date | yes | auto | — |

Indexes: `{ propertyId:1, status:1, createdAt:-1 }`; `{ ownerId:1, createdAt:-1 }`; `{ status:1, createdAt:1 }` — admin review queue.

Deletion: soft/expired status only; never hard delete a decided request. Applying changes is a transaction: re-validate proposed changes against current category/amenity state, apply whitelisted patch, increment `changeRequestVersion`, write `approvalHistory`-style audit and emit `PropertyUpdated`. Rejection leaves the property untouched.

---

### 3.10 `duplicateFlags`

Purpose: flag suspected duplicates for admin review (never auto-reject).

| Field | Type | Req | Notes |
|---|---|---|---|
| `_id` | ObjectId | yes | — |
| `propertyId` | ObjectId ref `properties` | yes | New listing |
| `matchedPropertyId` | ObjectId ref `properties` \| null | yes | Null for external-key heuristic |
| `strategy` | String enum `exact_address\|geo_proximity\|attribute_similarity\|unit_number\|external_id` | yes | Extensible strategy registry |
| `strategyVersion` | Number | yes | For reproducibility |
| `score` | Number 0..1 | yes | Weighted confidence |
| `signals` | Array `{field, value, weight}` | no | Explainable evidence |
| `status` | String enum `pending\|confirmed\|dismissed` | yes | default `pending` |
| `reviewedBy`, `reviewedAt`, `note` | ObjectId/Date/String \| null | no | Admin review |
| `createdAt` | Date | yes | — |

Indexes: `{ status:1, score:-1 }` — review queue; `{ propertyId:1, createdAt:-1 }`; partial unique `{ propertyId:1, matchedPropertyId:1, strategy:1 }` where `status:'pending'` to avoid repeated flags.

Deletion: keep for audit; no cascade. Detection strategies are pluggable and versioned; same-address units are legitimate, so score is advisory only.

---

### 3.11 `bookings`

Purpose: immutable-ish transactional record of a rental booking with snapshots.

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | — |
| `reference` | String | yes | — | unique, human-readable `BK-YYYYMMDD-XXXX` |
| `customerId` | ObjectId ref `users` | yes | — | Customer role enforced |
| `ownerId` | ObjectId ref `users` | yes | — | From property, never from client |
| `propertyId` | ObjectId ref `properties` | yes | — | — |
| `propertySnapshot` | Object | yes | — | `{id,title,categoryId,addressSummary,ownerSnapshot,coverMediaUrl,pricingVersion}` |
| `checkInDate`, `checkOutDate` | Date | yes | — | UTC midnight calendar dates; `checkOut > checkIn` |
| `rentalPeriod` | String enum | yes | — | One of property rental periods |
| `units` | Number int | yes | `1` | Number of rental periods |
| `guests` | Number \| null | no | `null` | Validated against `maxGuests` when required |
| `priceSnapshot` | Object | yes | — | See below |
| `bookingModeSnapshot` | String enum `instant\|request` | yes | — | Copied at creation |
| `status` | String enum `pending\|confirmed\|rejected\|cancellation_requested\|cancelled\|completed\|expired` | yes | `pending` or `confirmed` | Only via booking service |
| `statusBeforeCancellationRequest` | String enum \| null | no | `null` | Restore point if cancellation rejected |
| `payment` | Object | yes | `{status:'not_applicable', reference:null, provider:null, updatedAt:null}` | **Reference only**; no V1 processing logic |
| `specialRequests` | String \| null | no | `null` | max length |
| `approval` | Object | no | `null` | `{approvedBy, approvedAt, note}` |
| `cancellation` | Object | no | `null` | See below |
| `expiresAt` | Date \| null | no | `null` | V2 hold/expiry hook |
| `source` | String enum `customer\|owner\|admin` | yes | `customer` | Who created it |
| `schemaVersion` | Number int | yes | `1` | — |
| `createdAt`, `updatedAt` | Date | yes | auto | — |

**`priceSnapshot`**: `{ currency, period, units, unitAmountMinor, subtotalMinor, charges:[{code,label,amountMinor}], discounts:[{code,label,amountMinor}], taxMinor, totalMinor, ratesUsed:[{period,amountMinor}], calculationVersion, calculatedAt }`. Never recomputed after creation, even if property pricing changes.

**`cancellation`**: `{ status: 'none\|requested\|approved\|rejected\|admin_cancelled', reason, requestedBy, requestedAt, reviewedBy, reviewedAt, note }`. Customer requests never auto-cancel a confirmed booking; policy service decides allowed paths; history is in `bookingHistory`.

Indexes:
- `{ reference:1 }` **unique** — lookup by booking reference.
- `{ customerId:1, createdAt:-1 }` — customer booking list/history.
- `{ ownerId:1, createdAt:-1 }` — owner booking inbox.
- `{ propertyId:1, checkInDate:1, checkOutDate:1 }` — property booking history and reporting.
- `{ propertyId:1, status:1, checkInDate:1 }` — active-booking checks, admin change-request gating.
- `{ status:1, expiresAt:1 }` sparse — future expiry job and V1 status queues.
- `{ createdAt:-1 }` — admin global list.

Query patterns: customer/owner lists with status/date filters; admin list; property active-booking check; overlapping-date check (via reservations); reporting by property/owner/date; cancellation review queue.

Deletion: no hard delete. Admin may cancel and archive view; historical records retained. Account deletion preserves booking documents with snapshots and anonymized user tombstone.

Future: `payment` becomes a reference to a `payments` collection; `extensions`, `modifications`, `recurrence`, `reminders`, `guests` detail, and `commission` fields are additive.

---

### 3.12 `availabilityReservations`

Purpose: atomic date-level occupancy ledger used to prevent overlapping confirmed bookings.

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | — |
| `propertyId` | ObjectId ref `properties` | yes | — | — |
| `date` | Date | yes | — | UTC midnight, one document per occupied calendar date |
| `bookingId` | ObjectId ref `bookings` \| null | no | `null` | Null for owner blocks |
| `source` | String enum `booking\|owner_block\|maintenance` | yes | `booking` | — |
| `note` | String \| null | no | `null` | Owner block reason |
| `createdBy` | ObjectId ref `users` \| null | no | `null` | — |
| `createdAt` | Date | yes | auto | — |

Rules:
- A confirmed booking occupying `[checkIn, checkOut)` creates one document for each date from `checkIn` up to **but not including** `checkOut` (D1: same-day turnover allowed).
- Inserted inside a transaction with the booking status change. Compound unique index causes a duplicate-key conflict if any date is taken; the transaction aborts and the service returns `409 BOOKING_DATE_CONFLICT`.
- Cancellation/rejection deletes all documents for that `bookingId` in a transaction, releasing dates.
- Pending request-bookings do **not** create reservations in V1 (D2); availability is re-checked atomically at approval.
- Owner blocks use the same collection with `source:'owner_block'`, so they participate in the same conflict detection.

Indexes: `{ propertyId:1, date:1 }` **unique** — conflict prevention and availability lookup; `{ bookingId:1 }` sparse — release by booking.

Deletion: documents are deleted when a reservation is released; no historical need because `bookingHistory` and the booking itself retain dates.

Future: interval-based compression, recurring blocks, seasonal calendars, holds with expiry (add `holdId`/`expiresAt`, keep unique key).

---

### 3.13 `bookingHistory`

Purpose: complete status-transition history for operational/audit purposes.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | — |
| `bookingId` | ObjectId ref `bookings` | required, indexed |
| `fromStatus`, `toStatus` | String enum | required |
| `action` | String | e.g. `confirm`, `reject`, `request_cancellation`, `cancel`, `complete` |
| `actorId`, `actorRole` | ObjectId/String | required |
| `reason`, `note` | String \| null | optional |
| `metadata` | Object | safe request metadata |
| `createdAt` | Date | required |

Indexes: `{ bookingId:1, createdAt:-1 }`; `{ actorId:1, createdAt:-1 }`. Append-only.

---

### 3.14 `favorites`

Purpose: customer wishlist with duplicate prevention.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | — |
| `userId` | ObjectId ref `users` | required |
| `propertyId` | ObjectId ref `properties` | required |
| `createdAt` | Date | required |

Indexes: `{ userId:1, propertyId:1 }` **unique** — prevents duplicates and powers "is favorite"; `{ propertyId:1 }` — favorite counts / cleanup when a property is archived.

Deletion: user-initiated removal is a hard delete of the favorite row (no history needed). Property archival keeps favorites but list queries hide unavailable properties.

---

### 3.15 `notifications`

Purpose: in-app notification history and delivery status.

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | — |
| `userId` | ObjectId ref `users` | yes | — | Recipient |
| `type` | String enum (`BookingRequested`, `BookingConfirmed`, `BookingRejected`, `CancellationRequested`, `BookingCancelled`, `PropertySubmitted`, `PropertyApproved`, `PropertyRejected`, `AccountDeletionRequested`, `System`) | yes | — | From event contracts |
| `title`, `body` | String | yes | — | Rendered from templates |
| `data` | Object | no | `{}` | `{bookingId?, propertyId?, actorId?, eventId?}` |
| `isRead` | Boolean | yes | `false` | — |
| `readAt` | Date \| null | no | `null` | — |
| `delivery` | Object | no | `{inApp:true, email:'not_requested'}` | `email: not_requested\|queued\|sent\|failed` |
| `priority` | String enum `low\|normal\|high` | yes | `normal` | — |
| `eventId` | String \| null | no | `null` | Idempotency with outbox |
| `createdAt` | Date | yes | auto | — |

Indexes: `{ userId:1, isRead:1, createdAt:-1 }` — inbox + unread count; `{ userId:1, createdAt:-1 }` — history; `{ type:1, createdAt:-1 }` — admin/reporting; `{ 'data.bookingId':1 }`; partial unique `{ userId:1, eventId:1 }` where `eventId` exists — idempotent handlers.

Deletion: soft delete of user notifications is a V2 preference feature; otherwise retained. Email failures are retried by the dispatcher, never by business services.

Future: `channel` array, scheduled reminders, read receipts, preference filtering, push/SMS/WhatsApp channel records.

---

### 3.16 `deletionRequests`

Purpose: account deletion workflow with booking safeguards.

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | yes | auto | — |
| `userId` | ObjectId ref `users` | yes | — | — |
| `requestedBy` | String enum `user\|admin` | yes | `user` | — |
| `reason` | String \| null | no | `null` | — |
| `status` | String enum `pending\|approved\|rejected\|completed` | yes | `pending` | — |
| `activeBookingCheck` | Object | yes | — | `{hasActive:Boolean, bookingIds:[ObjectId], checkedAt:Date}` |
| `review` | Object | no | `null` | `{reviewedBy, reviewedAt, note}` |
| `processedAt` | Date \| null | no | `null` | — |
| `createdAt`, `updatedAt` | Date | yes | auto | — |

Indexes: `{ status:1, createdAt:1 }` — admin queue; `{ userId:1, createdAt:-1 }` — own status.

Deletion: never hard delete the request; it is part of the audit trail. On approval: users service anonymizes/tombstones the account, revokes sessions, emits `AccountDeletionCompleted`, sets status `completed`. Active confirmed bookings block automatic completion (policy-check service).

---

### 3.17 `auditLogs`

Purpose: append-only record of sensitive administrative actions.

| Field | Type | Req | Notes |
|---|---|---|---|
| `_id` | ObjectId | yes | — |
| `actorId` | ObjectId ref `users` | yes | Admin actor |
| `actorRole` | String | yes | Role at action time |
| `action` | String canonical | yes | e.g. `property.approve`, `booking.cancel`, `user.suspend`, `settings.update` |
| `entityType` | String enum `property\|booking\|user\|category\|amenity\|deletionRequest\|settings\|changeRequest` | yes | — |
| `entityId` | ObjectId/String | yes | — |
| `before`, `after` | Object \| null | no | Safe, redacted change values |
| `changeSummary` | Array | no | `{field, before, after}` |
| `reason` | String \| null | no | Required for destructive actions |
| `metadata` | Object | no | `{ip, userAgent, requestId, correlationId}` |
| `createdAt` | Date | yes | — |

Indexes: `{ entityType:1, entityId:1, createdAt:-1 }` — entity history; `{ actorId:1, createdAt:-1 }` — actor history; `{ action:1, createdAt:-1 }` — compliance reports; `{ createdAt:-1 }` — global timeline.

Deletion: append-only; no ordinary write path. No TTL in V1; archival/retention is a future compliance module. Never store passwords, tokens, reset links, or raw card/payment data.

---

### 3.18 `settings`

Purpose: typed platform configuration without code deploys.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | — |
| `key` | String unique | e.g. `maxImagesPerProperty`, `defaultCurrency`, `booking.policies.default`, `features.emailVerification` |
| `value` | Mixed | Validated by a per-key Zod schema in `admin.settings.service` |
| `description` | String | operator documentation |
| `updatedBy` | ObjectId ref `users` | Admin |
| `createdAt`, `updatedAt` | Date | — |

Index: `{ key:1 }` unique. Seeds: `maxImagesPerProperty=10`, `defaultCurrency='PKR'` (D6), `leadTimeDays=0`, `maxAdvanceDays=365`, `accessTokenTtlMinutes`, `refreshTokenTtlDays`, rate-limit thresholds, feature flags.

Deletion: configuration keys are deprecated, not deleted; keep safe defaults in `appConfig.js` so a missing key has a deterministic fallback.

---

### 3.19 `eventOutbox`

Purpose: at-least-once event delivery with retries and observability.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | — |
| `eventId` | String unique | UUID from event envelope |
| `type`, `version` | String, Number | e.g. `BookingConfirmed`, `1` |
| `payload`, `actor`, `correlationId` | Object/Object/String | Safe event data |
| `idempotencyKey` | String | Handler dedupe key |
| `status` | enum `pending\|processing\|done\|failed\|dead` | default `pending` |
| `attempts`, `maxAttempts` | Number | backoff control |
| `nextAttemptAt`, `lastError`, `processedAt` | Date/String/Date | operational detail |
| `createdAt` | Date | — |

Indexes: `{ eventId:1 }` unique; `{ status:1, nextAttemptAt:1, createdAt:1 }` — worker polling; `{ type:1, status:1 }` — failure inspection.

Retention: keep processed events for a configurable period, then archive; never delete pending/dead events silently.

---

## 4. Status dimensions and valid combinations

### 4.1 Property status dimensions

| Dimension | Values | Set by |
|---|---|---|
| `listingStatus` | `draft`, `published`, `archived` | owner (draft/publish/archive), admin (any) |
| `approvalStatus` | `pending`, `approved`, `rejected` | admin only, via approval service |
| `availability.status` | `available`, `booked`, `unavailable` | system projection + owner `isOpenForBooking` |

Valid examples: `published + pending` (visible only to owner/admin), `published + approved + available`, `published + approved + booked`, `published + approved + unavailable` (owner closed), `archived + approved`, `draft + pending`, `rejected + draft` (resubmission path).

Invalid: `archived + pending` publish attempts, `approved` without a submit record, `booked + archived` without admin approval, client-supplied status values.

Public visibility predicate:

```text
deletedAt == null
AND listingStatus == 'published'
AND approvalStatus == 'approved'
AND owner.accountStatus == 'active'
```

Bookable predicate adds: `availability.isOpenForBooking == true`, date range within `[today + leadTimeDays, today + maxAdvanceDays]`, no active reservations for requested dates, and valid price/rate configuration.

### 4.2 Booking status machine

See `06-workflows.md` for the full transition table and diagrams. All transitions occur through `booking.service.js`.

## 5. Relationships summary

- `users (owner) 1 → N properties` — reference `properties.ownerId`; snapshot on property.
- `users (customer) 1 → N bookings` — `bookings.customerId`.
- `users (owner) 1 → N bookings` — `bookings.ownerId` (denormalized from property for inbox queries).
- `properties 1 → N bookings` — `bookings.propertyId` + snapshot.
- `properties 1 → N availabilityReservations` — `availabilityReservations.propertyId`, unique per date.
- `bookings 1 → N availabilityReservations` — released together.
- `properties N ↔ N amenities` — `properties.amenities` refs + snapshot; category association on amenity.
- `propertyCategories 1 → N properties` — `categoryId`; self-reference for future subcategories.
- `properties 1 → N media` — `media.attachedTo`, `properties.media.coverMediaId`.
- `properties 1 → N approvalHistory`, `1 → N propertyChangeRequests`, `1 → N duplicateFlags`.
- `users 1 → N favorites`, `1 → N notifications`, `1 → N sessions`, `1 → N deletionRequests`.
- `admin users 1 → N auditLogs`, `1 → N settings updates`.

Full ER-style diagram: `03-database-relationships.md`.

## 6. Index philosophy

Every index above maps to a named query. Deliberately **not** indexed: every embedded field, every enum, `passwordHash`, provider URLs, free-text description alone. Multikey indexes are limited to `attributes` and `pricing.rates` because those are the primary filter surfaces; their write cost is accepted and documented. Text index is combined with structured filters rather than used alone. `2dsphere` exists only on `properties.location`. Index additions require an entry in `database/indexes/` and a query-pattern justification in this document.

## 7. Schema evolution strategy

1. Add optional fields with safe defaults (`null`, `false`, `0`, `[]`) before any code reads them.
2. Never rename or delete a field without a migration under `database/migrations/` plus a deprecation window; old readers must keep working.
3. Keep `schemaVersion` on `users`, `properties`, `bookings`; migration scripts bump it in batches and are idempotent.
4. Snapshots (`propertySnapshot`, `priceSnapshot`, `categorySnapshot`, `amenitySnapshot`, `ownerSnapshot`) make historical records immune to later schema changes.
5. New enum values are additive; removing a value requires a migration to a replacement plus compatibility mapping.
6. Every migration has forward and rollback logic, a dry-run mode, and a test that opens a pre-migration fixture document.
7. API changes use `/api/v1` → `/api/v2` adapters; databases stay shared during transition with compatibility readers.
8. Deprecated fields remain readable (selectively hidden from write validation) until the last consumer is migrated.

## 8. Consistency and transaction boundary

- Booking confirmation/rejection/approval, reservation insert/delete, and outbox event insertion occur in one MongoDB transaction.
- Property change-request application and its event/audit record occur in one transaction.
- Approval/rejection and audit/event insertion occur in one transaction.
- Single-document updates that are atomic by nature (favorite insert, notification read flag) need no transaction.
- Duplicate key errors are translated to conflict codes at the repository layer; services retry only safe idempotent operations.
- MongoDB replica set is assumed in production (see assumptions in `00-requirements-analysis.md`).
