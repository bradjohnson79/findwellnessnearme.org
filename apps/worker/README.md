# @wellnessnearme/worker

Tier‑1 ingestion worker pipeline (Phase 3). Feeds the admin queue; never publishes.

## Components

- **DISCOVER_LISTINGS**: creates `Listing` (dedup by `websiteDomain`) + `ListingDiscoveryEvent`, sets `moderationStatus=DRAFT`, then enqueues crawl.
- **CRAWL_WEBSITE**: robots-aware verification crawl of `/, /about, /services, /contact` (same-domain only) using Playwright; writes `CrawlAttempt` and updates `Listing.lastCrawledAt`, `verificationStatus`, `lastVerifiedAt`.
- **EXTRACT_AND_NORMALIZE**: derives minimal safe fields (name + neutral summary) and attaches modalities if they exist in taxonomy; moves `DRAFT → PENDING_REVIEW` when verified.
- **AI_EVALUATE_LISTING** (Phase 10): evaluates extracted crawl metadata + listing fields (no browsing). Always records an `AIReview`. If enabled and confidence is high enough, may auto-approve while preserving hard checks.

## Setup

Create `apps/worker/.env.local` (copy from `.env.example`):

```bash
DATABASE_URL="postgresql://...pooler.../neondb?sslmode=require"
REDIS_URL="redis://localhost:6379"
CRAWLER_USER_AGENT="wellnessnearme-bot/0.1 (+https://findwellnessnearme.org)"
```

Install deps:

```bash
cd /Users/bradjohnson/Documents/wellnessnearme.org
npm install
```

Playwright note: you may need to install browsers once:

```bash
npx playwright install chromium
```

Run the worker:

```bash
npm run -w @wellnessnearme/worker dev
```

## Enqueue discovery (MVP/testing)

Create a candidates file:

```json
[
  { "displayName": "Example Acupuncture", "websiteUrl": "https://example.com" }
]
```

Then enqueue:

```bash
npm run -w @wellnessnearme/worker enqueue:discover -- ./candidates.json "acupuncture san diego"
```

## Compliance guardrails (enforced by code)

- Tier‑1 only: crawls are **same-host** and limited to `/, /about, /services, /contact`.
- Robots respected: blocked paths create `CrawlAttempt(status=BLOCKED_ROBOTS)` and stop.
- No copying: worker stores only **derived** signals + internal hashes; public fields are neutral.
- No auto-publish: worker never sets `moderationStatus=APPROVED`.

## Phase 10 — AI-assisted auto-approval (optional, disabled by default)

AI is a policy enforcer, not an override. It evaluates only:
- extracted crawl metadata (`CrawlAttempt.extractedData`)
- structured listing fields + taxonomy assignments

It never browses the web.

### Env flags

- `AI_REVIEW_ENABLED=1`: enables AI evaluation jobs (writes `AIReview` records).
- `AI_REVIEW_PROVIDER=openai` + `OPENAI_API_KEY=...`: enables actual model calls.
- `AI_AUTO_APPROVAL_ENABLED=1`: enables auto-approval when all hard checks pass and AI returns PASS with confidence ≥ `AI_AUTO_APPROVE_MIN_CONFIDENCE` and no flags.

### Kill switch

Set `AI_AUTO_APPROVAL_ENABLED=0` to immediately stop auto-approving while still allowing AI reviews (or set `AI_REVIEW_ENABLED=0` to disable the entire evaluator).


