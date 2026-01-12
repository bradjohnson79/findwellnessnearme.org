# @wellnessnearme/admin

Admin Backend MVP for human-in-the-loop moderation.

## Scope (Phase 2)

- Listings queue: `/admin/listings`
- Listing review/detail: `/admin/listings/:id`
- Removal requests queue: `/admin/removal-requests`

No users. No roles. No analytics. No auto-publish.

## Setup

1) Create `/Users/bradjohnson/Documents/wellnessnearme.org/apps/admin/.env.local`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require"
ADMIN_BASIC_AUTH="admin:change-me"
```

2) Run:

```bash
cd /Users/bradjohnson/Documents/wellnessnearme.org
npm run -w @wellnessnearme/admin dev
```

3) Visit:

- `http://localhost:3000/admin/listings` (admin for `findwellnessnearme.org`)

Your browser will prompt for Basic Auth.

## Compliance rules enforced by backend behavior

- Public eligibility is **only** when:
  - `moderationStatus = APPROVED`
  - `deletedAt IS NULL`
  - `optedOutAt IS NULL`
- Every publish-affecting mutation runs in a **single transaction** and writes **exactly one** `ListingModerationEvent`.
- Any edit to public-facing fields forces **APPROVED → PENDING_REVIEW** and writes `SUBMIT_FOR_REVIEW`.


