# Document 5 — Permission Matrix (Phase 5)

## 1. Authorization model

- Canonical permissions live in `shared/constants/permissions.js`; roles map to permission sets in one place.
- `authorize(permission, options)` middleware checks the permission, then optional ownership/relation via the owning module's service.
- Actors: `Public` (no token), `Customer`, `Property Owner`, `Admin`. V1 accounts hold exactly one role; V2 may add roles/permissions without changing route code.
- Symbols: ✅ allowed, 🔒 allowed only with ownership/relation check, ⛔ denied, — not applicable.
- "Visible property" means `published + approved + not deleted + owner active`.

Permission name convention: `<resource>.<action>[.own|.any]`. Examples: `property.update.own`, `booking.approve.ownProperty`, `booking.cancel.any`, `user.suspend.any`, `auditLog.read`.

## 2. Authentication and profile

| Action | Public | Customer | Owner | Admin | Conditions / notes |
|---|---|---|---|---|---|
| Register customer/owner | ✅ | — | — | — | Role is server-assigned per endpoint; no role field accepted |
| Login / refresh / forgot / reset | ✅ | — | — | — | Rate-limited |
| View own profile | ⛔ | ✅ | ✅ | ✅ | Sanitized DTO |
| Update own profile | ⛔ | ✅ | ✅ | ✅ | Name/phone/preferences; email/phone change policy deferred |
| Change own password | ⛔ | ✅ | ✅ | ✅ | Revokes all sessions |
| Upload/remove own profile image | ⛔ | ✅ | ✅ | ✅ | Storage adapter validation |
| Request own account deletion | ⛔ | ✅ | ✅ | ✅ | Blocked/queued if active confirmed bookings |
| Create another admin | ⛔ | ⛔ | ⛔ | ✅ | `admin.create` + audit |
| Suspend/deactivate user | ⛔ | ⛔ | ⛔ | ✅ | `user.suspend.any` + audit + token revocation |
| Approve/reject deletion request | ⛔ | ⛔ | ⛔ | ✅ | `userDeletion.review.any` + audit |

## 3. Property categories and amenities

| Action | Public | Customer | Owner | Admin | Conditions |
|---|---|---|---|---|---|
| List active categories/amenities | ✅ | ✅ | ✅ | ✅ | Inactive only for admins |
| View category detail incl. attribute schema | ✅ | ✅ | ✅ | ✅ | — |
| Create/edit/deactivate category | ⛔ | ⛔ | ⛔ | ✅ | `category.manage` + audit; breaking schema changes gated |
| Create/edit/deactivate amenity | ⛔ | ⛔ | ⛔ | ✅ | `amenity.manage` + audit |

## 4. Properties

| Action | Public | Customer | Owner | Admin | Conditions |
|---|---|---|---|---|---|
| View public property detail | ✅ visible only | ✅ visible only | 🔒 own + visible | ✅ any | Non-visible only for owner/admin |
| Search/map browse | ✅ visible only | ✅ | ✅ | ✅ | Public predicate enforced in search service |
| Create property | ⛔ | ⛔ | ✅ | ✅ | Admin must provide an existing `ownerId` (D3); starts `draft + pending` |
| View own properties | ⛔ | ⛔ | 🔒 own | ✅ any | `property.read.own` |
| Edit property, no active confirmed booking | ⛔ | ⛔ | 🔒 own | ✅ any | Whitelisted fields; attribute revalidation |
| Edit property with active confirmed booking | ⛔ | ⛔ | 🔒 creates change request | ✅ direct or via change request | Admin approval required (§6.6) |
| Submit/resubmit for approval | ⛔ | ⛔ | 🔒 own | ✅ | `draft/rejected → pending` |
| Publish (listingStatus → published) | ⛔ | ⛔ | 🔒 own, approved only | ✅ | `409 NOT_APPROVED` otherwise |
| Archive available property | ⛔ | ⛔ | 🔒 own, no active booking | ✅ any | Owner booked path → admin approval |
| Upload/remove/reorder media, cover | ⛔ | ⛔ | 🔒 own | ✅ any | Max images from settings; safe cleanup |
| View approval history | ⛔ | ⛔ | 🔒 own | ✅ any | Append-only |
| View own change requests | ⛔ | ⛔ | 🔒 own | ✅ any | — |
| Approve/reject property | ⛔ | ⛔ | ⛔ | ✅ | `property.approve.any` + audit + events |
| Review change requests | ⛔ | ⛔ | ⛔ | ✅ | `propertyChangeRequest.review.any` + audit |
| Review duplicate flags | ⛔ | ⛔ | ⛔ | ✅ | Advisory only; no auto-delete |
| Permanently delete property | ⛔ | ⛔ | ⛔ | ✅ | Blocked if bookings/history exist (D10) |

## 5. Availability

| Action | Public | Customer | Owner | Admin | Conditions |
|---|---|---|---|---|---|
| Check date availability | ✅ | ✅ | ✅ | ✅ | Uses reservations + owner flag + lead/max window |
| Block dates / close future bookings | ⛔ | ⛔ | 🔒 own | ✅ any | Reservations with `source:'owner_block'` |
| Remove own block | ⛔ | ⛔ | 🔒 own | ✅ any | Cannot remove a booking reservation |
| View cached availability status | ✅ via detail | ✅ | 🔒 own | ✅ | Cache is projection, not source of truth |

## 6. Bookings

| Action | Public | Customer | Owner | Admin | Conditions |
|---|---|---|---|---|---|
| Create booking | ⛔ | ✅ own identity | ⛔ | ✅ with `customerId` | Server-side price + availability; `customerId` from token for customers |
| View own customer bookings | ⛔ | 🔒 own | — | ✅ any | `booking.read.own` |
| View bookings for owned properties | ⛔ | ⛔ | 🔒 related property | ✅ any | Owner derived from property, not request body |
| View booking detail | ⛔ | 🔒 own | 🔒 booked property | ✅ any | `403` otherwise; no IDOR |
| View booking history | ⛔ | 🔒 own | 🔒 related | ✅ any | — |
| Approve pending request | ⛔ | ⛔ | 🔒 own property | ✅ any | Atomic recheck of dates; audit for admin |
| Reject pending request | ⛔ | ⛔ | 🔒 own property | ✅ any | Reason required |
| Request cancellation | ⛔ | 🔒 own | — | ✅ | Never auto-cancels confirmed booking (D4) |
| Directly cancel booking | ⛔ | policy-allowed only | 🔒 own property | ✅ any | Policy service; reason required; releases reservations |
| Review cancellation request | ⛔ | ⛔ | 🔒 own property | ✅ any | Rejection restores prior status |
| Modify booking dates | ⛔ | ⛔ | ⛔ future | ✅ any | Reprice + reservation swap in transaction; audit |
| Mark completed | ⛔ | ⛔ | 🔒 own property | ✅ any | Only from confirmed |
| Expire pending booking | ⛔ | ⛔ | ⛔ | ✅ / job | Disabled in V1 policy |

## 7. Favorites and notifications

| Action | Public | Customer | Owner | Admin | Conditions |
|---|---|---|---|---|---|
| Add/remove favorite | ⛔ | 🔒 own | ⛔ | ⛔ | V1 favorites are a customer capability |
| List favorites | ⛔ | 🔒 own | ⛔ | 🔒 own as support view | Unique `(userId, propertyId)` |
| Check favorite status | ⛔ | 🔒 own | ⛔ | ✅ | — |
| View own notifications | ⛔ | ✅ | ✅ | ✅ | Ownership check by `userId` |
| Mark read / read all | ⛔ | 🔒 own | 🔒 own | 🔒 own | — |
| View unread count | ⛔ | ✅ | ✅ | ✅ | — |

## 8. Admin-only operational resources

| Action | Public | Customer | Owner | Admin | Conditions |
|---|---|---|---|---|---|
| List all users | ⛔ | ⛔ | ⛔ | ✅ | Sanitized DTOs |
| View all properties/bookings | ⛔ | ⛔ | ⛔ | ✅ | `*.read.any` |
| Create bookings on behalf of customers | ⛔ | ⛔ | ⛔ | ✅ | Audit entry required |
| Read audit logs | ⛔ | ⛔ | ⛔ | ✅ | Append-only |
| Manage platform settings | ⛔ | ⛔ | ⛔ | ✅ | Per-key Zod validation + audit |
| View reports | ⛔ | ⛔ | ⛔ | ✅ | V1 basic; expansion point |

## 9. Ownership enforcement checklist (backend)

- [ ] Property edit/archive/submit: `properties.isOwnedBy(propertyId, actorId)` re-read from DB.
- [ ] Booking detail/cancel/complete: relation check through `bookings.isRelated(bookingId, actorId, role)`.
- [ ] Owner inbox: filter by `ownerId` from the property, never from query input.
- [ ] Customer bookings: filter by `customerId` from the access token.
- [ ] Media operations: resolve property → owner before allowing upload/delete.
- [ ] Notifications: `notification.userId === actor._id`.
- [ ] Favorites: `favorite.userId === actor._id`.
- [ ] Admin actions: permission check + audit log in the same transaction as the state change.
- [ ] No client-supplied `status`, `approvalStatus`, `roles`, `ownerId`, `price`, `currency`, or `paymentStatus` is ever accepted by write endpoints.

## 10. Future granular permissions

V2 can introduce role objects such as `propertyManager` with a scoped permission grant:

```json
{ "role": "propertyManager", "scope": { "propertyIds": ["65..."] }, "permissions": ["property.update.own", "booking.approve.ownProperty"] }
```

Because checks go through `authorize()` and property ownership resolution goes through the properties service, adding delegated managers does not require touching controllers or rewriting ownership queries.
