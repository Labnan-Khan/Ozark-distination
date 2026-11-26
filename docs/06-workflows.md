# Document 6 — Workflows and State Design (Phase 4)

## 1. User registration and authentication

```mermaid
flowchart TD
  Start[POST /auth/register/customer or /owner] --> Validate[Zod validate fields]
  Validate -->|invalid| Err400[400 VALIDATION_ERROR]
  Validate --> Normalize[Normalize email, trim name, validate password]
  Normalize --> Duplicate{email exists?}
  Duplicate -->|yes| Err409[409 EMAIL_IN_USE]
  Duplicate -->|no| Hash[bcrypt hash password]
  Hash --> Create[Insert user: roles from endpoint, accountStatus=active, tokenVersion=0]
  Create --> Outbox[Write UserRegistered event in transaction]
  Outbox --> Tokens[Create session + access/refresh tokens]
  Tokens --> Notify[Worker: welcome in-app + email]
  Tokens --> Response[201 user DTO + tokens]
```

Security notes: role is chosen by the endpoint, never the body; email enumeration is avoided on forgot-password; failed logins increment `failedLoginAttempts` and can set `lockedUntil`; refresh rotation revokes the family on reuse.

## 2. Property submission and approval

```mermaid
flowchart TD
  Create[Owner POST /properties] --> Validate[Validate category + typed attributes + pricing + amenities]
  Validate -->|invalid| Reject400[400 VALIDATION_ERROR]
  Validate --> Draft[Insert property: listingStatus=draft, approvalStatus=pending]
  Draft --> Duplicate[Async duplicate detection strategies]
  Duplicate --> Flag[Create duplicateFlags if score above threshold - advisory only]
  Draft --> Submit[POST /properties/:id/submit]
  Submit --> Pending[approvalStatus=pending, submittedAt=now, approvalHistory entry]
  Pending --> Queue[Admin pending queue]
  Queue --> Decision{Admin decision}
  Decision -->|approve| Approved[approvalStatus=approved, approvedAt, audit, PropertyApproved event]
  Decision -->|reject| Rejected[approvalStatus=rejected, reason required, audit, PropertyRejected event]
  Approved --> Publish[Owner/admin sets listingStatus=published]
  Rejected --> Correct[Owner corrects and resubmits; new approval cycle]
  Approved --> Visible[Public visibility predicate true]
```

### Property lifecycle — three independent dimensions

```mermaid
stateDiagram-v2
  [*] --> Draft

  state "listingStatus" as Listing {
    [*] --> draft
    draft --> published : publish (requires approved)
    published --> archived : archive (owner: no active booking; admin: any)
    archived --> published : admin unarchive
    draft --> archived : admin archive
  }

  state "approvalStatus" as Approval {
    [*] --> pending
    pending --> approved : admin approve
    pending --> rejected : admin reject
    rejected --> pending : resubmit
    approved --> pending : material change resubmission (policy)
  }

  state "availability.status" as Availability {
    [*] --> available
    available --> booked : confirmed booking covers today
    booked --> available : booking cancelled/completed/past
    available --> unavailable : owner closes bookings or blocks all dates
    unavailable --> available : owner reopens
  }
```

Invalid transitions:
- `rejected → published` without a new approval.
- `archived → published` by a non-admin without approval checks.
- `booked → archived` by owner (requires admin path).
- Client-supplied status values on any write endpoint.
- `approved` without a recorded submit/approval history entry.

`availability.status` is a **cache** updated by the booking service and a nightly projection job. The authoritative state is `availabilityReservations` plus `availability.isOpenForBooking`.

## 3. Property editing while booked

```mermaid
flowchart TD
  Edit[Owner PATCH /properties/:id] --> Check{Active confirmed booking?}
  Check -->|no| Direct[Validate whitelisted changes, apply in transaction]
  Direct --> Event[PropertyUpdated event + audit if admin]
  Check -->|yes| CR[Create propertyChangeRequest: requestedChanges, currentSnapshot, proposedSnapshot, diff]
  CR --> Pending[status=pending; property unchanged]
  Pending --> AdminQueue[Admin review queue]
  AdminQueue --> Decision{Decision}
  Decision -->|approve| Apply[Revalidate against current category/amenities, apply whitelisted patch, increment changeRequestVersion, emit event]
  Decision -->|reject| NoChange[status=rejected, reason required; property unchanged]
  Apply --> Stale{Snapshot stale?}
  Stale -->|yes| Conflict[409 STALE_SNAPSHOT - re-request]
```

Definition of "active confirmed booking" for this rule: `status = confirmed` **and** `checkOutDate > now`, including upcoming bookings. Price changes never rewrite existing `priceSnapshot` values.

## 4. Instant booking (atomic confirmation)

```mermaid
sequenceDiagram
  participant C as Customer
  participant API as Controller
  participant B as BookingService
  participant P as PropertiesService
  participant DB as MongoDB (transaction)
  participant OB as Outbox/Worker

  C->>API: POST /bookings {propertyId, checkIn, checkOut, period}
  API->>B: createBooking(input, actor)
  B->>P: getBookableSnapshot(propertyId)
  P-->>B: public+approved, open, rates, config, ownerId
  B->>B: validate dates, period, units, guests, window
  B->>B: compute priceSnapshot server-side
  B->>DB: startTransaction
  B->>DB: insert reservations for [checkIn, checkOut)
  alt any date already reserved
    DB-->>B: duplicate key error
    B->>DB: abort transaction
    B-->>API: 409 BOOKING_DATE_CONFLICT
  else all dates free
    B->>DB: insert booking status=confirmed
    B->>DB: insert bookingHistory + eventOutbox(BookingConfirmed)
    B->>DB: commit
    B-->>API: 201 booking
    API-->>C: 201 {booking}
    OB->>OB: notify customer + owner, update availability cache
  end
```

Boundary rule (D1): a booking occupying `[checkIn, checkOut)` reserves dates `checkIn … checkOut−1 day`. A new booking starting on the old `checkOut` date is allowed (same-day turnover). Monthly/yearly bookings are expanded to day-level reservations.

## 5. Request-based booking

```mermaid
sequenceDiagram
  participant C as Customer
  participant O as Owner/Admin
  participant B as BookingService
  participant DB as MongoDB
  participant N as Notifications

  C->>B: POST /bookings
  B->>B: validate + price snapshot (mode=request)
  B->>DB: insert booking status=pending (no reservations - D2)
  B->>N: BookingRequested → owner + customer notifications
  B-->>C: 201 {status:pending}
  O->>B: POST /bookings/:id/approve or /reject
  alt approve
    B->>DB: startTransaction
    B->>DB: insert reservations atomically
    alt conflict
      B->>DB: abort → 409 BOOKING_DATE_CONFLICT (booking stays pending)
    else success
      B->>DB: status=confirmed, approval info, history, outbox
      B->>DB: commit
      B->>N: BookingConfirmed → customer
    end
  else reject
    B->>DB: status=rejected, history, outbox, reason
    B->>N: BookingRejected → customer
  end
```

Pending bookings do not hold dates in V1; availability is rechecked at approval. A conflict at approval returns `409` and keeps the request pending so the owner can ask the customer for different dates. Hold-with-expiry is a V2 policy.

## 6. Booking state machine

```mermaid
stateDiagram-v2
  [*] --> pending : request mode
  [*] --> confirmed : instant mode
  pending --> confirmed : owner/admin approve (availability recheck)
  pending --> rejected : owner/admin reject
  pending --> expired : policy/job (V2; disabled V1)
  confirmed --> cancellation_requested : customer requests cancellation
  confirmed --> cancelled : owner/admin cancel
  confirmed --> completed : owner/admin complete
  cancellation_requested --> cancelled : request approved
  cancellation_requested --> confirmed : request rejected (restore prior status)
  cancellation_requested --> cancelled : admin cancels directly
  rejected --> [*]
  cancelled --> [*]
  completed --> [*]
  expired --> [*]
```

| From | To | Allowed actor | Guard |
|---|---|---|---|
| pending | confirmed | owner of property, admin | Date recheck + reservation insert |
| pending | rejected | owner, admin | Reason required |
| pending | expired | job/admin | Policy enabled; V1 disabled |
| confirmed | cancellation_requested | customer (own), admin | Reason required |
| confirmed | cancelled | owner, admin | Policy allows; release reservations |
| confirmed | completed | owner, admin | `checkOut <= now` recommended |
| cancellation_requested | cancelled | owner, admin | Approve request; release reservations |
| cancellation_requested | confirmed | owner, admin | Reject request; restore `statusBeforeCancellationRequest` |

Invalid transitions: `rejected → confirmed` via customer action; `cancelled → confirmed`; `completed → cancelled` (unless admin correction with audit and explicit policy); `expired → confirmed`; any transition by an unauthorized actor; any direct model update bypassing the service.

## 7. Cancellation workflow

```mermaid
flowchart TD
  Request[Customer POST /bookings/:id/cancellation-request with reason] --> Status{ booking status? }
  Status -->|confirmed| SetCR[status=cancellation_requested + cancellation.status=requested + history + notifications]
  Status -->|other| Invalid[400 INVALID_STATE_TRANSITION]
  SetCR --> Review{Owner/admin decision}
  Review -->|approve| Cancel[status=cancelled, cancellation.status=approved, reviewedBy/At, delete reservations, release dates, notify]
  Review -->|reject| Restore[status=statusBeforeCancellationRequest, cancellation.status=rejected, note, notify]
  Direct[Owner/admin POST /bookings/:id/cancel] --> Policy{Cancellation policy allows?}
  Policy -->|yes| Cancel
  Policy -->|no| Forbidden[403 POLICY_DISALLOWS]
```

Policy service in V1:
- Customer requests never cancel a confirmed booking automatically.
- Owner may cancel a confirmed booking with a reason; admin may cancel any booking.
- Cancellation history is immutable; reservations are deleted in the same transaction.
- Refunds are out of scope; `payment.status` may be set to `not_applicable` or later updated by the future payment module via events.

## 8. Account deletion

```mermaid
flowchart TD
  Req[Customer/owner POST /users/me/deletion-requests] --> Check{Active confirmed bookings involving user?}
  Check -->|yes| Hold[status=pending + activeBookingCheck.hasActive=true; admin review required]
  Check -->|no| PendingCreate[status=pending]
  PendingCreate --> AdminQueue[Admin deletion queue]
  Hold --> AdminQueue
  AdminQueue --> Review{Admin decision}
  Review -->|reject| Rejected[status=rejected, reason, notify]
  Review -->|approve| Safeguards{Policy safeguards satisfied?}
  Safeguards -->|no| Rejected
  Safeguards -->|yes| Complete[Set accountStatus=deleted, deletedAt, anonymize PII, clear passwordHash, tokenVersion++, revoke sessions, status=completed, audit]
  Complete --> Preserve[Preserve bookings, audit logs, snapshots; keep user tombstone for reference integrity]
  Direct[Admin DELETE user directly] --> Safeguards
```

Safeguards: active confirmed bookings block automatic completion (D9); historical bookings keep `customerId`/`ownerId` pointing to a tombstone plus their own snapshots; no cascade delete of properties/bookings/audit; owner properties are archived (not destroyed) on deletion; session/reset tokens revoked.

## 9. Availability lifecycle and date rules

```mermaid
flowchart LR
  Open[Owner isOpenForBooking=true] --> Query[Check requested dates]
  Query --> Window{Within lead/max advance window?}
  Window -->|no| Unavailable[409 PROPERTY_NOT_BOOKABLE]
  Window -->|yes| Reservations{Any active reservation on dates?}
  Reservations -->|yes| Conflict[409 BOOKING_DATE_CONFLICT]
  Reservations -->|no| Allowed[Allowed - create/approve booking]
  Allowed --> Insert[Insert one reservation per date in transaction]
  Insert --> Cache[Projection job updates availability.status]
```

- Authoritative occupancy: `availabilityReservations` documents (unique per property+date).
- Owner control: `availability.isOpenForBooking`, `leadTimeDays`, `maxAdvanceDays`, and owner-block reservations.
- Cached `availability.status` is derived from today's date vs. reservation ranges; public search filters use real reservations for the queried date range.
- Same-day turnover allowed (D1); check-in and check-out are date-only values.
- A booked property remains publicly visible; it simply rejects conflicting dates.
