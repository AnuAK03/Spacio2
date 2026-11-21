# ParkPool AI — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **User Identity & Role Integrity (`/users/{userId}`)**:
   - Every `/users/{userId}` document must have `uid == request.auth.uid == userId` and `email == request.auth.token.email` on creation, with `email_verified == true`.
   - Non-admin users can only register with `role` in `['driver', 'host']`. Self-assigning `role: 'admin'` is strictly rejected unless `isAdmin()` is true (bootstrapped admin email `anuak2628@gmail.com` with `email_verified == true` or existing `/admins/{uid}`).
   - PII fields (`email`, `displayName`, `organization`) are strictly readable only by `isOwner(userId)` or `isAdmin()`.
2. **Driver Profile & License (`/driverProfiles/{userId}`)**:
   - Strictly isolated to `isOwner(userId)` or `isAdmin()`.
   - Non-admins cannot self-set `verified: true` or alter `uid` / `createdAt`.
3. **Provider Onboarding & Verification (`/providers/{providerId}`)**:
   - `ownerUid` must equal `request.auth.uid` on creation and remain immutable.
   - Providers can NEVER create or update their `verificationStatus` to `'APPROVED'`, `'UNDER_REVIEW'`, `'REJECTED'`, `'SUSPENDED'`, or `'EXPIRED'` — only `'NOT_SUBMITTED'` or `'SUBMITTED'` are permitted for owners; all verification transitions require `isAdmin()`.
4. **Bookings (`/bookings/{bookingId}`)**:
   - `driverUid` must equal `request.auth.uid` on creation and remain immutable.
   - New client bookings must start in `status: 'held'` and `paymentStatus` in `['unpaid', 'pending_order']`.
   - `totalAmountInr` cannot be altered by the driver on update.
   - Terminal statuses (`completed`, `cancelled`, `expired`) are locked from non-admin modification.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Privilege Escalation (User Create)**: Non-admin creates `/users/{uid}` with `{ role: "admin" }`.
2. **Role Tampering (User Update)**: Driver updates `/users/{uid}` changing `{ role: "admin" }` or `{ email: "anuak2628@gmail.com" }`.
3. **PII Blanket Read / Scrape**: Signed-in user executes `list` on `/users` or `get` on `/users/{otherUid}` or `/driverProfiles/{otherUid}`.
4. **Unverified Email Spoof**: Signed-in user with `email: "anuak2628@gmail.com"` and `email_verified: false` attempts admin read/write.
5. **Shadow / Ghost Field Injection**: User writes `/users/{uid}` with extra ghost field `{ isSuperAdmin: true }` or `/providers/{id}` with `{ feeWaived: true }`.
6. **Provider Self-Approval**: Provider creates or updates `/providers/{id}` with `{ verificationStatus: "APPROVED" }`.
7. **Driver Self-Verification**: Driver creates `/driverProfiles/{uid}` with `{ verified: true }`.
8. **ID Poisoning / Resource Exhaustion**: User attempts to write `/providers/${"a".repeat(500)}` or injects a 20KB string into `displayName` or `organizationName`.
9. **Client Timestamp Forgery**: User creates `/users/{uid}` with a backdated `createdAt` or `updatedAt != request.time`.
10. **Cross-Owner Booking Hijack / Price Tampering**: Driver updates `/bookings/{id}` modifying `totalAmountInr` or `driverUid`.
11. **Terminal State Bypass**: Driver updates a booking with existing `status == "completed"` back to `"confirmed"`.
12. **Admin Registry Tampering**: Non-admin attempts to create `/admins/{uid}` to promote themselves.
