# Document 8 — Future Compatibility Review (Phase 6)

Method: for each planned future capability, check whether V1 decisions create a blocking change. "Ready" means the capability can be added as a new module/field/interface with no rewrite of core business logic. "Watch" means a known future change is needed and is documented.

## 1. Owner features

| Future feature | Verdict | V1 support | Required future work |
|---|---|---|---|
| Owner identity verification | Ready | `users.verification`, stable `userId`, permission registry | New `ownerVerifications` module; badge derived in read model |
| CNIC/document uploads | Ready | `media.attachedTo.type='user'`, `resourceType='document'` | Verification-specific upload policy and access controls |
| Verified-owner badges | Ready | No badge field on `properties`; add optional derived field later | Display + search projection update |
| Multiple property managers | Ready | `properties.ownerId` stable; `authorize()` resolves ownership via service | `propertyAssignments` collection + scoped permission grants |
| Property agents/delegated permissions | Ready | Permission registry is centralized | Role definitions and scope checks |
| Owner analytics | Ready | Bookings/audit/history contain IDs and timestamps | Read model/reporting tables; no OLTP schema rewrite |
| Advanced owner dashboards | Ready | APIs are module-based and paginated | Aggregation endpoints, caching adapter |

## 2. Property features

| Future feature | Verdict | V1 support | Required future work |
|---|---|---|---|
| Parent buildings/child units | Ready | `parentPropertyId` reserved; each unit is already independent | Hierarchy service and inheritance rules; avoid making parent required |
| Property portfolios | Ready | ownerId + parent field | New collection, no property schema rewrite |
| Videos/floor plans/virtual tours/360 | Ready | `media.resourceType` generic and provider-agnostic | New upload UX/limits per type |
| Advanced availability calendars | Ready | Reservations have `source`; owner blocks already use them | Recurring rules, imports/exports |
| Seasonal availability | Ready | Reservations are date-level; pricing/rules separate | Seasonal rule engine |
| Property maintenance/document workflows | Ready | Optional fields + media documents | New module; no core schema change |
| Category-specific fields | Ready | Typed `attributeSchema` validated by service | Add attributes as data; migrate only if a field becomes universally filterable |

## 3. Booking features

| Future feature | Verdict | V1 support | Required future work |
|---|---|---|---|
| Advanced cancellation policies | Ready | `policy.service.js` centralizes rules; `cancellation` object and history | Policy collection/rule evaluation; no controller changes |
| Booking extensions/modifications | Ready | State machine + transaction pattern + `bookingHistory` | Modification entities, reprice, reservation swap |
| Recurring bookings | Watch | Date-level reservations support many dates | Add recurrence definition and generation job; watch document/date growth |
| Booking reminders | Ready | Job layer + notification events | Reminder handler and preferences |
| Automated expiration | Ready | `status='expired'`, `expiresAt`, policy hook | Enable hold policy + expiry job |
| Advanced guest management | Ready | `guests` optional; booking snapshots | Guests collection linked to booking |
| Price changes after booking | Ready | `priceSnapshot` never recalculated | No core change |

## 4. Pricing and finance

| Future feature | Verdict | V1 support | Required future work |
|---|---|---|---|
| Seasonal pricing/promotions/codes | Ready | `pricing.version`, `priceSnapshot.calculationVersion`, isolated `pricing.service.js` | `pricingRules` module + quote service |
| Additional charges/deposits/taxes | Ready | Reserved fields in `pricing` and snapshot arrays | Enable and update calculation; preserve old snapshots |
| Online payments | Ready | `bookings.payment` reference object; no payment logic in booking module | `payments` module, gateway adapters, webhooks, state sync via events |
| Refunds/invoices/payouts/commissions/disputes | Ready | Stable booking/customer/owner IDs + immutable price snapshot | Finance collections and reporting |
| Financial reporting | Ready | Audit/history/settings + future finance data | Read models, not OLTP overload |

## 5. Communication features

| Future feature | Verdict | V1 support | Required future work |
|---|---|---|---|
| Built-in messaging | Ready | Bookings/properties/users are stable anchors | New conversation/message modules |
| Chat file sharing | Ready | Media provider abstraction | Attach media records to messages |
| SMS/push/WhatsApp | Ready | Event bus + `NotificationChannel` interface | New adapters and delivery records |
| Notification preferences | Ready | `users.preferences` reserved | Preferences module and filtering in notification service |
| Scheduled reminders | Ready | Jobs + event outbox | New job handlers |

## 6. Business/platform features

| Future feature | Verdict | V1 support | Required future work |
|---|---|---|---|
| Subscription plans/featured listings | Ready | `settings` flags, audit, module boundaries | `subscriptions`/`promotions` modules |
| Advanced analytics/reporting | Ready | Event/audit/history data; search repository interface | Reporting projection database, ETL |
| Multi-country/multi-currency | Watch | `currency` stored per property and booking; country fields present | FX provider, locale settings, region rules. Watch: V1 has no conversion, so cross-currency search comparisons need normalization later |
| Two-factor authentication | Ready | Sessions, `tokenVersion`, auth module isolation | Challenge flow, step-up JWT claims |
| More granular permissions | Ready | Permission registry + ownership resolvers | Role/scoped grant data |
| Advanced search engine | Ready | `PropertySearchRepository` interface | Adapter implementation, projection sync, dual-read migration |
| Caching | Ready | `CacheProvider` interface reserved | Redis adapter + invalidation on events |
| Background processing scale | Ready | Job interface + outbox | Queue adapter (BullMQ/SQS), worker scaling |
| Mobile APIs | Ready | `/api/v1` service layer is version-agnostic | `/api/v2` adapters |

## 7. Gap register and mitigations

| # | Gap | Risk | Mitigation already designed |
|---|---|---|---|
| G1 | Currency normalization for search across currencies | Medium | Store integer minor units + ISO currency on every property and booking; add `currency` filter in V1 search; V2 FX service normalizes into a search projection |
| G2 | Attribute filters need indexes when a new attribute becomes popular | Low | Typed attribute value slots + generic compound indexes; migration path to a search projection collection |
| G3 | Reservation docs per day grow for long bookings | Low | Documented trade-off; interval compression or dedicated calendar in V2; yearly booking ≈ 365 docs |
| G4 | Pending booking conflicts at approval | Medium | Documented D2; atomic recheck returns 409; V2 holds with expiry |
| G5 | Event outbox retention growth | Low | Status indexes + configurable archival job; pending/dead events never silently deleted |
| G6 | Many admin roles | Low | Permission registry + `extraPermissions`; no hardcoded role checks |
| G7 | Hard-coded PKR default | Low | Default lives in `settings`, not code constants; property-level currency is authoritative |
| G8 | Deleted user references in historical records | Medium | Tombstone users, snapshots on bookings/properties, no cascade delete |
| G9 | Same-day turnover semantics could change | Medium | D1 confirmation needed; changing it later is a policy+rules change, not a schema rewrite |
| G10 | Multi-role accounts | Low | `roles` is an array from V1 with a one-role invariant; removal of invariant is data/permission work |

## 8. Decisions that would have blocked future versions (avoided)

- Storing images as BLOBs in MongoDB → avoided with `media` records.
- Hardcoding categories/amenities in enums → avoided with managed collections.
- Single overloaded `status` on properties → avoided with three dimensions.
- Calculating price on the client or from current property price → avoided with server `priceSnapshot`.
- Embedding all bookings into a property document → avoided with separate collection.
- Direct provider SDK calls in controllers/services → avoided with adapters.
- Auto-deleting bookings with a property/user → avoided with tombstones/snapshots.
- Simple "unique address" duplicate rule → avoided with strategy-based flags.
- Synchronous email inside booking transaction → avoided with outbox/jobs.
- Direct status updates from controllers → avoided with state machines/services.

## 9. Conclusion

No identified future feature requires replacing the database or rewriting core business modules. The main watch items are currency normalization for cross-currency search (G1), index strategy for newly popular attributes (G2), and reservation-document growth for very long bookings (G3). Each has a documented extension point and can be addressed with a new module or projection rather than a rebuild.
