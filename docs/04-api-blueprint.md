# Document 4 — API Blueprint (Phase 5)

## 1. Conventions

- Base URL: `/api/v1`. Future breaking APIs mount at `/api/v2` with adapters; both may run concurrently against the same database.
- JSON only. `Content-Type: application/json`. Multipart only for media upload endpoints.
- Auth: `Authorization: Bearer <accessToken>`; refresh token sent in body (not URL).
- Roles in tables: `Public`, `C`, `O`, `A`, `C/O`, `A/O`, etc. All non-public routes require authentication.
- Ownership: `own` means the service verifies `ownerId`/`customerId` against the authenticated actor; IDs from the client are never trusted for ownership.
- Timestamps ISO-8601 UTC; dates `YYYY-MM-DD`; money as integer minor units + `currency`.
- Validation: Zod schemas per route; `validateRequest` parses `body`, `query`, `params`. Unknown fields are rejected on writes.
- Pagination on all list endpoints: `page` (default 1), `limit` (default 20, max 100), `sort` (e.g. `-createdAt,price`). Response `meta`: `{page, limit, total, totalPages, hasNext, hasPrev}`.
- Optional `Idempotency-Key` header on `POST /bookings` and admin state-change endpoints; duplicate key returns the original result.
- Error response:

```json
{ "success": false, "error": { "code": "FORBIDDEN", "message": "You cannot modify this property", "details": [], "requestId": "req_..." } }
```

- Success response: `{ "success": true, "data": <object|array>, "meta": <object|undefined> }`.
- Standard status codes: `200`, `201`, `204` (no body), `400` validation, `401` auth, `403` permission/ownership, `404` not found, `409` conflict/state, `429` rate limit, `500` internal.
- Common error codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION`, `BOOKING_DATE_CONFLICT`, `PROPERTY_NOT_APPROVED`, `PROPERTY_NOT_BOOKABLE`, `DUPLICATE_RESOURCE`, `RATE_LIMITED`, `TOKEN_EXPIRED`, `TOKEN_REUSE_DETECTED`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `MEDIA_LIMIT_REACHED`.

## 2. Authentication — `/api/v1/auth`

| Method | URL | Purpose | Auth/Role | Request body | Query | Response / errors |
|---|---|---|---|---|---|---|
| POST | `/auth/register/customer` | Customer registration | Public | `fullName, email, password, phone?, profileImage?` | — | `201 {user, tokens}`; `400`, `409 EMAIL_IN_USE`, `429` |
| POST | `/auth/register/owner` | Owner registration (open) | Public | same fields | — | `201 {user, tokens}`; role fixed server-side; `400`, `409`, `429` |
| POST | `/auth/login` | Login with email/password | Public | `email, password` | — | `200 {user, tokens}`; `401 INVALID_CREDENTIALS`, `423 ACCOUNT_LOCKED`, `429` |
| POST | `/auth/refresh` | Rotate refresh token | Public | `refreshToken` | — | `200 {tokens}`; `401 TOKEN_EXPIRED`, `TOKEN_REUSE_DETECTED` |
| POST | `/auth/logout` | Revoke current session | Bearer + C/O/A | — | — | `204`; `401` |
| POST | `/auth/logout-all` | Revoke all sessions | Bearer + C/O/A | — | — | `200 {revokedCount}` |
| POST | `/auth/forgot-password` | Email reset link | Public | `email` | — | `202 {accepted:true}` (always); `429` |
| POST | `/auth/reset-password` | Reset with token | Public | `token, newPassword` | — | `200 {reset:true}`; `400 INVALID_OR_EXPIRED_TOKEN` |
| GET | `/auth/me` | Current identity | Bearer + C/O/A | — | — | `200 {user, permissions}`; `401` |

Rules: password min 12 chars, bcrypt; role can never be supplied in registration; `passwordHash`, tokens, and reset tokens are never returned. Login rate-limits by IP and normalized email. `permissions` array is computed from the permission registry.

## 3. Users — `/api/v1/users`

| Method | URL | Purpose | Auth/Role | Request body | Query | Response / errors |
|---|---|---|---|---|---|---|
| GET | `/users/me` | Own profile | C/O/A | — | — | `200 {user}` sanitized |
| PATCH | `/users/me` | Update name/phone/preferences | C/O/A | `fullName?, phone?, preferences?` | — | `200 {user}`; `400`. Email/phone change policy deferred (D5/§16) → `409 CHANGE_NOT_ALLOWED` until enabled |
| POST | `/users/me/profile-image` | Upload/update profile image | C/O/A | multipart `image` | — | `201 {media}`; `400`, `413`, `FILE_TYPE_NOT_ALLOWED` |
| DELETE | `/users/me/profile-image` | Remove profile image | C/O/A | — | — | `204` |
| POST | `/users/me/change-password` | Change password, revoke sessions | C/O/A | `currentPassword, newPassword` | — | `200 {changed:true}`; `400`, `401` |
| POST | `/users/me/deletion-requests` | Request account deletion | C/O/A | `reason?` | — | `201 {request}`; `409 ACTIVE_BOOKINGS_EXIST` when policy blocks |
| GET | `/users/me/deletion-requests` | Own deletion request status | C/O/A | — | — | `200 {request}` |

## 4. Properties — `/api/v1/properties`

| Method | URL | Purpose | Auth/Role | Request body | Query | Response / errors |
|---|---|---|---|---|---|---|
| POST | `/properties` | Create draft property | O, A (admin must supply `ownerId`) | `title, description, categoryId, subcategoryId?, address, location?, attributes[], amenities[], pricing, rentalPeriods, bookingConfig, availability?` | — | `201 {property}` with `listingStatus:'draft'`, `approvalStatus:'pending'`; `400` category-attribute validation, `403`, `422 DUPLICATE_SUSPECTED` (flag only, still created) |
| GET | `/properties/:id` | Public/owner detail | Public for visible; O/A for own/any | — | — | `200 {property, media, availability}`; `404` if not visible and not authorized |
| GET | `/properties/me` | Owner's listings | O, A | — | `page, limit, listingStatus?, approvalStatus?, sort` | `200 {properties[], meta}` |
| PATCH | `/properties/:id` | Edit own property | O(own), A | whitelisted fields | — | `200 {property}` if no active confirmed booking; else `202 {changeRequest}`; `403`, `409 PROPERTY_BOOKED`, `422` attribute validation |
| POST | `/properties/:id/submit` | Submit/resubmit for approval | O(own), A | `note?` | — | `200 {property}`; `400 INVALID_STATE`, `409 ALREADY_PENDING` |
| POST | `/properties/:id/publish` | Set `listingStatus=published` | O(own), A | — | — | `200 {property}`; `409 NOT_APPROVED` |
| POST | `/properties/:id/archive` | Archive listing | O(own, no active booking), A | `reason?` | — | `200 {property}`; `409 ACTIVE_BOOKINGS_EXIST` (owner path → admin approval workflow) |
| GET | `/properties/:id/availability` | Check dates | Public | — | `checkIn, checkOut, guests?` | `200 {available, reason?, quotedPrice?}`; `400`, `404` |
| POST | `/properties/:id/blocks` | Block dates / close availability | O(own), A | `dates[]` or `{isOpenForBooking:false, leadTimeDays?, maxAdvanceDays?}` | — | `201 {reservations}`; `409 DATE_CONFLICT` |
| DELETE | `/properties/:id/blocks/:reservationId` | Remove owner block | O(own), A | — | — | `204` |
| POST | `/properties/:id/media` | Upload image(s) | O(own), A | multipart `images[]` | — | `201 {media[]}`; `413`, `MEDIA_LIMIT_REACHED` |
| PATCH | `/properties/:id/media/:mediaId` | Set cover / reorder | O(own), A | `{isCover?:true, displayOrder?:n}` | — | `200 {media}`; `404` |
| DELETE | `/properties/:id/media/:mediaId` | Remove media | O(own), A | — | — | `202 {status:'pending_delete'}` |
| GET | `/properties/:id/change-requests` | Own change requests | O(own), A | — | pagination | `200` |
| GET | `/properties/:id/approval-history` | Approval trail | O(own), A | — | pagination | `200` |

## 5. Admin properties — `/api/v1/admin/properties`

| Method | URL | Purpose | Auth/Role | Request/query | Response / errors |
|---|---|---|---|---|---|
| GET | `/admin/properties` | All properties | A | `approvalStatus?, listingStatus?, ownerId?, categoryId?, page, limit, sort` | `200 {properties[], meta}` |
| GET | `/admin/properties/:id` | Full detail incl. history | A | — | `200 {property, approvalHistory, changeRequests, duplicateFlags}` |
| POST | `/admin/properties/:id/approve` | Approve listing | A | `note?` | `200 {property}`; `409 ALREADY_APPROVED`; audit + events |
| POST | `/admin/properties/:id/reject` | Reject listing | A | `reason` (required) | `200 {property}`; `400` |
| POST | `/admin/properties/:id/archive` | Admin archive (incl. booked) | A | `reason` | `200 {property}`; audit |
| POST | `/admin/properties/:id/unarchive` | Restore from archive | A | `reason?` | `200 {property}` |
| GET | `/admin/property-change-requests` | Review queue | A | `status?, page, limit` | `200 {requests[], meta}` |
| GET | `/admin/property-change-requests/:id` | Request detail | A | — | `200 {request}` |
| POST | `/admin/property-change-requests/:id/approve` | Apply whitelisted changes | A | `note?` | `200 {property}`; `409 STALE_SNAPSHOT`, `422 VALIDATION_ERROR`; transactional |
| POST | `/admin/property-change-requests/:id/reject` | Reject changes | A | `reason` | `200 {request}`; property unchanged |
| GET | `/admin/duplicates` | Duplicate review queue | A | `status?, minScore?, page, limit` | `200 {flags[], meta}` |
| POST | `/admin/duplicates/:id/confirm` | Confirm duplicate | A | `note?` | `200 {flag}`; flags for review only, no auto-delete |
| POST | `/admin/duplicates/:id/dismiss` | Dismiss flag | A | `note?` | `200 {flag}` |

## 6. Categories and amenities — `/api/v1`

| Method | URL | Purpose | Auth/Role | Request/query | Response / errors |
|---|---|---|---|---|---|
| GET | `/categories` | Active categories (with attribute schemas) | Public | `group?, includeInactive?` (A only) | `200 {categories[]}` |
| GET | `/categories/:id` | Category detail | Public | — | `200 {category}` |
| POST | `/admin/categories` | Create category + attribute schema | A | `code, name, group, parentId?, attributeSchema[], allowedRentalPeriods[], isActive?` | `201 {category}`; `400`, `409` |
| PATCH | `/admin/categories/:id` | Edit category/schema | A | partial | `200 {category}`; `409 SCHEMA_IN_USE` when breaking for existing values |
| POST | `/admin/categories/:id/deactivate` | Deactivate | A | — | `200 {category}`; existing properties unaffected |
| GET | `/amenities` | Amenity catalog | Public | `categoryId?, includeInactive?` (A only) | `200 {amenities[]}` |
| POST | `/admin/amenities` | Create amenity | A | `code, name, description?, icon?, categoryIds[]` | `201 {amenity}` |
| PATCH | `/admin/amenities/:id` | Edit amenity | A | partial | `200 {amenity}` |
| POST | `/admin/amenities/:id/deactivate` | Deactivate | A | — | `200 {amenity}`; historical snapshots preserved |

## 7. Bookings — `/api/v1/bookings`

| Method | URL | Purpose | Auth/Role | Request body | Query | Response / errors |
|---|---|---|---|---|---|---|
| POST | `/bookings` | Create booking (instant → confirmed; request → pending) | C, A (admin supplies `customerId`) | `propertyId, checkIn, checkOut, rentalPeriod, guests?, specialRequests?` | — | `201 {booking}` or `409 BOOKING_DATE_CONFLICT`, `409 PROPERTY_NOT_BOOKABLE`, `422 PRICE_MISMATCH` (server recomputes), `403` |
| GET | `/bookings/me` | Customer bookings/history | C | — | `status?, from?, to?, page, limit` | `200 {bookings[], meta}` |
| GET | `/bookings/owner` | Owner booking inbox | O | — | `status?, propertyId?, page, limit` | `200 {bookings[], meta}` |
| GET | `/bookings/:id` | Booking detail | C(own), O(related), A | — | — | `200 {booking}`; `403`, `404` |
| GET | `/bookings/:id/history` | Status history | related C/O, A | — | — | `200 {events[]}` |
| POST | `/bookings/:id/approve` | Approve pending request | O(own), A | `note?` | — | `200 {booking}`; `409 BOOKING_DATE_CONFLICT` (atomic recheck), `400 INVALID_STATE` |
| POST | `/bookings/:id/reject` | Reject pending request | O(own), A | `reason` | `200 {booking}` |
| POST | `/bookings/:id/cancellation-request` | Customer asks to cancel | C(own), A | `reason` | `202 {booking}`; `400 INVALID_STATE` |
| POST | `/bookings/:id/cancel` | Cancel booking | O(own)/A; C only when policy allows | `reason`, `reviewNote?` | `200 {booking}`; `403 POLICY_DISALLOWS` |
| POST | `/bookings/:id/review-cancellation` | Approve/reject cancellation request | O(own), A | `decision: approve\|reject, note?` | `200 {booking}`; rejected restores prior status |
| POST | `/bookings/:id/complete` | Mark completed | O(own), A | — | `200 {booking}`; `400 INVALID_STATE` |
| PATCH | `/bookings/:id/dates` | Modify dates | A | `checkIn, checkOut` | `200 {booking}`; revalidation + reprice + reservation swap in transaction |

Admin also uses `GET /admin/bookings` with filters (`customerId, ownerId, propertyId, status, date range`) and `POST /admin/bookings` with required `customerId`; all admin actions write `auditLogs`.

Price rule: the server loads the property pricing, computes `priceSnapshot`, and ignores any client-supplied amount. `checkOut > checkIn`, period must be allowed, units within `minUnits/maxUnits`, guests within `maxGuests`.

## 8. Favorites — `/api/v1/favorites`

| Method | URL | Purpose | Auth/Role | Request | Query | Response / errors |
|---|---|---|---|---|---|---|
| POST | `/favorites` | Add favorite | C | `{propertyId}` | — | `201 {favorite}`; `409 ALREADY_FAVORITE`, `404` if not visible |
| DELETE | `/favorites/:propertyId` | Remove favorite | C | — | — | `204` |
| GET | `/favorites` | List favorites | C | — | `page, limit, sort` | `200 {properties[], meta}`, hides unavailable/archived |
| GET | `/favorites/:propertyId/status` | Is favorite + availability | C | — | — | `200 {isFavorite, available}` |

## 9. Notifications — `/api/v1/notifications`

| Method | URL | Purpose | Auth/Role | Response / errors |
|---|---|---|---|---|
| GET | `/notifications` | Inbox | C/O/A | `200 {notifications[], meta}`; `page, limit, unreadOnly?` |
| GET | `/notifications/unread-count` | Badge count | C/O/A | `200 {count}` |
| PATCH | `/notifications/:id/read` | Mark read | owner of notification | `200 {notification}`; `403`, `404` |
| PATCH | `/notifications/read-all` | Mark all read | C/O/A | `200 {updatedCount}` |

## 10. Search — `/api/v1/search`

| Method | URL | Purpose | Auth/Role | Query parameters | Response |
|---|---|---|---|---|---|
| GET | `/search/properties` | Filter + sort + paginate | Public | `q, country, stateProvince, city, area, categoryId, subcategoryId, subcategoryCode, minPrice, maxPrice, period, checkIn, checkOut, bedroomsMin, bathroomsMin, furnishing, amenities=wifi,parking, attributes.bedrooms=2, sort=newest\|price_asc\|price_desc, page, limit` | `200 {properties[], meta, filters}` |
| GET | `/search/map` | Map results in bbox | Public | `bbox=minLng,minLat,maxLng,maxLat` or `lat,lng,radiusKm`, plus common filters | `200 {properties[], meta}` |

Search returns only public-visible properties; availability filters use reservation data, not the cached status. Complex future search swaps the repository implementation, not the endpoint contract.

## 11. Admin user/lifecycle/settings/audit — `/api/v1/admin`

| Method | URL | Purpose | Auth/Role | Request/query | Response / errors |
|---|---|---|---|---|---|
| GET | `/admin/users` | List users | A | `role?, accountStatus?, q?, page, limit` | `200 {users[], meta}` (sanitized) |
| POST | `/admin/users` | Create admin account | A | `fullName, email, password, phone?` | `201 {user}`; `403`, `409` |
| GET | `/admin/users/:id` | User detail | A | — | `200 {user, sessionsSummary}` |
| PATCH | `/admin/users/:id/status` | Suspend/deactivate/activate | A | `accountStatus, reason` | `200 {user}`; audit + `tokenVersion++` on suspension |
| POST | `/admin/users/:id/delete` | Direct deletion (policy-checked) | A | `reason` | `202 {deletionRequest}`; `409 ACTIVE_BOOKINGS_EXIST` |
| GET | `/admin/deletion-requests` | Deletion queue | A | `status?, page, limit` | `200 {requests[], meta}` |
| POST | `/admin/deletion-requests/:id/approve` | Approve deletion | A | `note?` | `200 {request}`; audit |
| POST | `/admin/deletion-requests/:id/reject` | Reject deletion | A | `reason` | `200 {request}`; audit |
| GET | `/admin/audit-logs` | Audit timeline | A | `actorId?, action?, entityType?, entityId?, from?, to?, page, limit` | `200 {logs[], meta}`; read-only |
| GET | `/admin/settings` | Platform settings | A | — | `200 {settings[]}` |
| PATCH | `/admin/settings/:key` | Update setting | A | `{value}` | `200 {setting}`; `400` schema validation; audit |
| GET | `/admin/reports/bookings` | Basic report | A | `from, to, groupBy=day\|city\|category` | `200 {rows[], meta}`; future extension |

## 12. Health/meta

| Method | URL | Purpose | Auth | Response |
|---|---|---|---|---|
| GET | `/health/live` | Liveness | Public | `200 {status:'ok'}` |
| GET | `/health/ready` | DB/queue readiness | Public | `200 {status:'ready'}` or `503` |

## 13. Response examples

Property detail (public, abbreviated):

```json
{
  "success": true,
  "data": {
    "id": "65...",
    "title": "2-bed apartment in DHA",
    "category": { "id": "65...", "code": "apartment", "name": "Apartment" },
    "address": { "city": "Lahore", "area": "DHA", "country": "PK" },
    "location": { "type": "Point", "coordinates": [74.35, 31.47] },
    "attributes": [{ "key": "bedrooms", "dataType": "integer", "numberValue": 2 }],
    "pricing": { "currency": "PKR", "rates": [{ "period": "monthly", "amountMinor": 8500000 }] },
    "availability": { "isOpenForBooking": true, "status": "available" },
    "media": [{ "id": "65...", "secureUrl": "https://...", "isCover": true }]
  }
}
```

Booking confirmation error:

```json
{
  "success": false,
  "error": {
    "code": "BOOKING_DATE_CONFLICT",
    "message": "Selected dates are no longer available",
    "details": [{ "field": "checkIn", "message": "conflicts with an existing confirmed booking" }],
    "requestId": "req_01J..."
  }
}
```

## 14. API versioning policy

- Controllers/services are version-agnostic; version-specific request/response adapters live under `routes/v1/` and future `routes/v2/`.
- Additive, backward-compatible changes stay in v1 (new optional fields, new enum values, new filters).
- Breaking changes (renamed fields, changed semantics, removed endpoints) create v2 while v1 remains supported for a deprecation window.
- Database documents remain shared; compatibility readers/writers handle both shapes during transition.
