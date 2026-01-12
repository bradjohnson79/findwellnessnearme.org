import { ModerationStatus } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma";
import ListingsTableClient, { type ListingRow } from "./ListingsTableClient";

export const dynamic = "force-dynamic";

const ALL_STATUSES: ModerationStatus[] = [
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "DRAFT",
  "UNPUBLISHED",
  "OPTED_OUT"
];

function isModerationStatus(x: string | undefined): x is ModerationStatus {
  return !!x && (ALL_STATUSES as string[]).includes(x);
}

function daysAgo(d: Date) {
  const ms = Date.now() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default async function ListingsQueuePage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams ?? {};
  const statusParam = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const needsAttention = (Array.isArray(sp.attention) ? sp.attention[0] : sp.attention) === "1";
  const aiNeedsHumanParam = (Array.isArray(sp.ai) ? sp.ai[0] : sp.ai) === "1";
  const qRaw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = (qRaw ?? "").trim();
  const verificationFilterRaw = Array.isArray(sp.verification) ? sp.verification[0] : sp.verification;
  const verificationFilter =
    verificationFilterRaw === "FAILED" || verificationFilterRaw === "STALE" ? verificationFilterRaw : null;

  // Phase 10.3 — AI-first moderation (default path):
  // If no filters are provided, default to the exception queue: AI needs human review.
  const hasAnyFilter =
    Boolean(statusParam) ||
    Boolean(sp.attention) ||
    Boolean(sp.ai) ||
    Boolean(q) ||
    Boolean(verificationFilterRaw);

  const aiNeedsHuman = hasAnyFilter ? aiNeedsHumanParam : true;
  const status: ModerationStatus = isModerationStatus(statusParam)
    ? statusParam
    : "PENDING_REVIEW";

  const tokens = q ? q.split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 5) : [];
  const searchWhere =
    tokens.length === 0
      ? {}
      : {
          AND: tokens.map((t) => ({
            OR: [
              { displayName: { contains: t, mode: "insensitive" as const } },
              { websiteDomain: { contains: t, mode: "insensitive" as const } },
              { websiteUrl: { contains: t, mode: "insensitive" as const } },
              {
                locations: {
                  some: {
                    deletedAt: null,
                    OR: [
                      { street1: { contains: t, mode: "insensitive" as const } },
                      { street2: { contains: t, mode: "insensitive" as const } },
                      { postalCode: { contains: t, mode: "insensitive" as const } },
                      { city: { name: { contains: t, mode: "insensitive" as const } } },
                      { city: { slug: { contains: t, mode: "insensitive" as const } } },
                      { city: { state: { uspsCode: { contains: t, mode: "insensitive" as const } } } },
                      { city: { state: { name: { contains: t, mode: "insensitive" as const } } } },
                      { city: { state: { slug: { contains: t, mode: "insensitive" as const } } } }
                    ]
                  }
                }
              }
            ]
          }))
        };

  const counts = await prisma.listing.groupBy({
    by: ["moderationStatus"],
    _count: { _all: true }
  });
  const countByStatus = new Map<ModerationStatus, number>();
  for (const c of counts as Array<{ moderationStatus: ModerationStatus; _count: { _all: number } }>) {
    countByStatus.set(c.moderationStatus, c._count._all);
  }
  const totalListings = Array.from(countByStatus.values()).reduce((a, b) => a + b, 0);

  const listings = await prisma.listing.findMany({
    where: {
      moderationStatus: status,
      ...(needsAttention ? { needsAttention: true } : {}),
      ...(aiNeedsHuman ? { aiNeedsHumanReview: true } : {}),
      ...(verificationFilter ? { verificationStatus: verificationFilter } : {}),
      ...(searchWhere as any)
    },
    // Admin default: stable alphabetical ordering.
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take: 200
  });

  const listingIds = listings.map((l) => l.id);
  const domains = Array.from(new Set(listings.map((l) => l.websiteDomain).filter(Boolean)));

  const [domainCounts, discoveryEvents, crawls] = await Promise.all([
    domains.length
      ? prisma.listing.groupBy({
          by: ["websiteDomain"],
          where: { websiteDomain: { in: domains } },
          _count: { _all: true }
        })
      : Promise.resolve([]),
    listingIds.length
      ? prisma.listingDiscoveryEvent.findMany({
          where: { listingId: { in: listingIds } },
          select: { listingId: true, discoveredAt: true },
          orderBy: [{ discoveredAt: "asc" }]
        })
      : Promise.resolve([]),
    listingIds.length
      ? prisma.crawlAttempt.findMany({
          where: { listingId: { in: listingIds } },
          select: {
            listingId: true,
            startedAt: true,
            status: true,
            robotsAllowed: true
          },
          orderBy: [{ listingId: "asc" }, { startedAt: "desc" }]
        })
      : Promise.resolve([])
  ]);

  const hasRecentFlag = new Map<string, boolean>();
  const hasRecentSummaryRefresh = new Map<string, boolean>();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentActions = listingIds.length
    ? await prisma.listingModerationEvent.findMany({
        where: {
          listingId: { in: listingIds },
          actorType: "SYSTEM",
          createdAt: { gt: new Date(cutoff) },
          action: { in: ["FLAG_ATTENTION", "REFRESH_SUMMARY"] }
        },
        select: { listingId: true, action: true }
      })
    : [];
  for (const a of recentActions) {
    if (a.action === "FLAG_ATTENTION") hasRecentFlag.set(a.listingId, true);
    if (a.action === "REFRESH_SUMMARY") hasRecentSummaryRefresh.set(a.listingId, true);
  }

  const duplicateDomain = new Map<string, boolean>();
  for (const row of domainCounts as Array<{ websiteDomain: string; _count: { _all: number } }>) {
    duplicateDomain.set(row.websiteDomain, row._count._all > 1);
  }

  const firstDiscoveredAtByListingId = new Map<string, Date>();
  for (const ev of discoveryEvents) {
    if (!firstDiscoveredAtByListingId.has(ev.listingId)) {
      firstDiscoveredAtByListingId.set(ev.listingId, ev.discoveredAt);
    }
  }

  const latestCrawlByListingId = new Map<
    string,
    { status: string; robotsAllowed: boolean | null; startedAt: Date }
  >();
  for (const c of crawls) {
    if (!latestCrawlByListingId.has(c.listingId)) {
      latestCrawlByListingId.set(c.listingId, {
        status: c.status,
        robotsAllowed: c.robotsAllowed ?? null,
        startedAt: c.startedAt
      });
    }
  }

  // Derived-only flag: "stale verification". This is *not* a schema concept, just an admin hint.
  const STALE_DAYS = 120;

  const rows: ListingRow[] = listings.map((l) => {
    const dup = duplicateDomain.get(l.websiteDomain) ?? false;
    const latestCrawl = latestCrawlByListingId.get(l.id);
    const robotsBlocked = latestCrawl?.status === "BLOCKED_ROBOTS" || latestCrawl?.robotsAllowed === false;
    const stale =
      l.verificationStatus === "STALE" || (!!l.lastVerifiedAt && daysAgo(l.lastVerifiedAt) > STALE_DAYS);
    const flagged = hasRecentFlag.get(l.id) ?? false;
    const refreshed = hasRecentSummaryRefresh.get(l.id) ?? false;
    const discoveredAt = firstDiscoveredAtByListingId.get(l.id);

    const flags = [
      l.needsAttention ? "needs-attention" : null,
      // Phase 10: AI routed to human review (separate from system needsAttention).
      (l as any).aiNeedsHumanReview ? "ai-needs-human-review" : null,
      (l as any).approvalSource === "AI" ? "ai-approved" : null,
      dup ? "duplicate-domain" : null,
      robotsBlocked ? "robots-blocked" : null,
      stale ? "stale-verification" : null,
      flagged ? "recent-system-flag" : null,
      refreshed ? "summary-refreshed" : null
    ].filter(Boolean) as string[];

    return {
      id: l.id,
      displayName: l.displayName,
      websiteUrl: l.websiteUrl,
      websiteDomain: l.websiteDomain,
      moderationStatus: l.moderationStatus,
      verificationStatus: l.verificationStatus,
      latestCrawlStatus: latestCrawl?.status ?? null,
      latestCrawlRobotsAllowed: latestCrawl?.robotsAllowed ?? null,
      lastCrawledAtIso: l.lastCrawledAt ? l.lastCrawledAt.toISOString() : null,
      lastVerifiedAtIso: l.lastVerifiedAt ? l.lastVerifiedAt.toISOString() : null,
      discoveredAtIso: discoveredAt ? discoveredAt.toISOString() : null,
      flags
    };
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Listings</h2>

      <div style={{ fontSize: 12, opacity: 0.85 }}>
        Total: <strong>{totalListings}</strong> ·{" "}
        {ALL_STATUSES.map((s, idx) => (
          <span key={s}>
            <a href={`/admin/listings?status=${s}`}>{s}</a> ({countByStatus.get(s) ?? 0})
            {idx < ALL_STATUSES.length - 1 ? " · " : ""}
          </span>
        ))}
      </div>

      <form method="get" action="/admin/listings" style={{ display: "flex", gap: 8 }}>
        <label>
          Status{" "}
          <select name="status" defaultValue={status}>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" name="attention" value="1" defaultChecked={needsAttention} />
          Needs attention
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" name="ai" value="1" defaultChecked={aiNeedsHuman} />
          AI needs human review
        </label>
        <label>
          Search{" "}
          <input
            name="q"
            defaultValue={q}
            placeholder="name, city, state, domain…"
            style={{ width: 220 }}
          />
        </label>
        <label>
          Verification{" "}
          <select name="verification" defaultValue={verificationFilter ?? ""}>
            <option value="">(any)</option>
            <option value="STALE">STALE</option>
            <option value="FAILED">FAILED</option>
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Showing up to 200 listings. Bulk actions are gated server-side.
      </div>

      <ListingsTableClient rows={rows} />
    </div>
  );
}


