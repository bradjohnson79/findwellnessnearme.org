"use server";

import { ModerationAction, Prisma } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma";
import { crawlJobIdForToday, workerQueue } from "../../../src/lib/workerQueue";

const STALE_DAYS = 120;

function daysAgo(d: Date) {
  const ms = Date.now() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((x) => x.trim()).filter(Boolean)));
}

export type BulkModerateResult = {
  attempted: number;
  succeeded: number;
  skipped: { listingId: string; reason: string }[];
};

export type BulkReverifyResult = {
  attempted: number;
  queued: number;
  skipped: { listingId: string; reason: string }[];
};

function isBulkAction(a: ModerationAction): a is "SUBMIT_FOR_REVIEW" | "APPROVE" | "REJECT" | "UNPUBLISH" {
  return a === "SUBMIT_FOR_REVIEW" || a === "APPROVE" || a === "REJECT" || a === "UNPUBLISH";
}

export async function bulkModerateListings(ids: string[], action: ModerationAction): Promise<BulkModerateResult> {
  if (!Array.isArray(ids)) throw new Error("ids must be an array");
  if (!isBulkAction(action)) throw new Error("Unsupported bulk action");

  const unique = uniqueIds(ids);
  const attempted = unique.length;
  if (!attempted) return { attempted: 0, succeeded: 0, skipped: [] };
  if (attempted > 500) throw new Error("Too many ids (max 500)");

  // Fetch basic listing fields for rule enforcement.
  const listings = await prisma.listing.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      moderationStatus: true,
      verificationStatus: true,
      needsAttention: true,
      websiteDomain: true,
      lastVerifiedAt: true,
      optedOutAt: true,
      deletedAt: true
    }
  });
  const byId = new Map(listings.map((l) => [l.id, l]));

  // Duplicate-domain gate (conservative): if a domain has >1 listing in DB, treat as needs-attention.
  const domains = Array.from(new Set(listings.map((l) => l.websiteDomain).filter(Boolean)));
  const domainCounts = domains.length
    ? await prisma.listing.groupBy({
        by: ["websiteDomain"],
        where: { websiteDomain: { in: domains } },
        _count: { _all: true }
      })
    : [];
  const dupDomain = new Map<string, boolean>();
  for (const row of domainCounts as Array<{ websiteDomain: string; _count: { _all: number } }>) {
    dupDomain.set(row.websiteDomain, row._count._all > 1);
  }

  // Latest crawl per listing.
  const crawls = await prisma.crawlAttempt.findMany({
    where: { listingId: { in: unique } },
    select: { listingId: true, status: true, robotsAllowed: true, startedAt: true },
    orderBy: [{ listingId: "asc" }, { startedAt: "desc" }]
  });
  const latestCrawlById = new Map<string, { status: string; robotsAllowed: boolean | null; startedAt: Date }>();
  for (const c of crawls) {
    if (!latestCrawlById.has(c.listingId)) {
      latestCrawlById.set(c.listingId, { status: c.status, robotsAllowed: c.robotsAllowed ?? null, startedAt: c.startedAt });
    }
  }

  // Recent system flag events (7d).
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentFlags = await prisma.listingModerationEvent.findMany({
    where: {
      listingId: { in: unique },
      actorType: "SYSTEM",
      action: "FLAG_ATTENTION",
      createdAt: { gt: cutoff }
    },
    select: { listingId: true }
  });
  const hasRecentFlag = new Set(recentFlags.map((r) => r.listingId));

  const skipped: BulkModerateResult["skipped"] = [];
  const eligible: string[] = [];

  for (const id of unique) {
    const l = byId.get(id);
    if (!l) {
      skipped.push({ listingId: id, reason: "not_found" });
      continue;
    }

    if (action === "SUBMIT_FOR_REVIEW") {
      if (l.moderationStatus !== "DRAFT") {
        skipped.push({ listingId: id, reason: "not_draft" });
        continue;
      }
      eligible.push(id);
      continue;
    }

    if (action === "APPROVE") {
      if (l.moderationStatus !== "PENDING_REVIEW") {
        skipped.push({ listingId: id, reason: "not_pending_review" });
        continue;
      }
      if (l.verificationStatus !== "VERIFIED") {
        skipped.push({ listingId: id, reason: "not_verified" });
        continue;
      }
      if (l.needsAttention) {
        skipped.push({ listingId: id, reason: "needs_attention" });
        continue;
      }
      if (l.optedOutAt) {
        skipped.push({ listingId: id, reason: "opted_out" });
        continue;
      }
      if (l.deletedAt) {
        skipped.push({ listingId: id, reason: "deleted" });
        continue;
      }

      const latestCrawl = latestCrawlById.get(id);
      if (!latestCrawl) {
        skipped.push({ listingId: id, reason: "no_crawl" });
        continue;
      }
      const robotsBlocked = latestCrawl.status === "BLOCKED_ROBOTS" || latestCrawl.robotsAllowed === false;
      if (latestCrawl.status !== "SUCCESS") {
        skipped.push({ listingId: id, reason: "latest_crawl_not_success" });
        continue;
      }
      if (robotsBlocked) {
        skipped.push({ listingId: id, reason: "robots_blocked" });
        continue;
      }

      // Extra safety: derived attention signals (conservative, server-side).
      const domainIsDup = l.websiteDomain ? (dupDomain.get(l.websiteDomain) ?? false) : true;
      // In this branch TS has already narrowed verificationStatus to "VERIFIED".
      // For derived staleness, rely on lastVerifiedAt age only.
      const stale = !!l.lastVerifiedAt && daysAgo(l.lastVerifiedAt) > STALE_DAYS;
      const derivedAttention = domainIsDup || stale || hasRecentFlag.has(id);
      if (derivedAttention) {
        skipped.push({ listingId: id, reason: "needs_attention_derived" });
        continue;
      }

      eligible.push(id);
      continue;
    }

    if (action === "REJECT") {
      if (l.moderationStatus !== "PENDING_REVIEW") {
        skipped.push({ listingId: id, reason: "not_pending_review" });
        continue;
      }
      eligible.push(id);
      continue;
    }

    if (action === "UNPUBLISH") {
      if (l.moderationStatus !== "APPROVED") {
        skipped.push({ listingId: id, reason: "not_approved" });
        continue;
      }
      eligible.push(id);
      continue;
    }
  }

  if (!eligible.length) {
    return { attempted, succeeded: 0, skipped };
  }

  const succeededIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    // IMPORTANT:
    // - Only use `tx.*` inside the transaction callback (never `prisma.*`)
    // - Avoid long per-id loops; do set-based updates + createMany for stability.
    // This prevents intermittent "Transaction not found" errors under pooled connections.

    const idsSql = Prisma.join(eligible);

    let updated: Array<{ id: string }> = [];
    if (action === "SUBMIT_FOR_REVIEW") {
      updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "Listing"
        SET "moderationStatus" = 'PENDING_REVIEW', "updatedAt" = NOW()
        WHERE "id" IN (${idsSql})
          AND "moderationStatus" = 'DRAFT'
        RETURNING "id"
      `);
    } else if (action === "APPROVE") {
      // Server-side re-check (strict):
      // - Listing is PENDING_REVIEW + VERIFIED + not attention/opted-out/deleted
      // - Latest crawl is SUCCESS and robotsAllowed is not false
      // NOTE: Use a CTE to compute the latest crawl per listing. This avoids Postgres
      // scoping issues with referencing the UPDATE target table inside LATERAL.
      updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        WITH latest_crawl AS (
          SELECT DISTINCT ON (c."listingId")
            c."listingId",
            c."status",
            c."robotsAllowed"
          FROM "CrawlAttempt" c
          WHERE c."listingId" IN (${idsSql})
          ORDER BY c."listingId", c."startedAt" DESC
        )
        UPDATE "Listing" l
        SET "moderationStatus" = 'APPROVED', "updatedAt" = NOW()
        FROM latest_crawl lc
        WHERE l."id" = lc."listingId"
          AND l."id" IN (${idsSql})
          AND l."moderationStatus" = 'PENDING_REVIEW'
          AND l."verificationStatus" = 'VERIFIED'
          AND l."needsAttention" = false
          AND l."optedOutAt" IS NULL
          AND l."deletedAt" IS NULL
          AND lc."status" = 'SUCCESS'
          AND (lc."robotsAllowed" IS NULL OR lc."robotsAllowed" <> false)
        RETURNING l."id"
      `);
    } else if (action === "REJECT") {
      updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "Listing"
        SET "moderationStatus" = 'REJECTED', "updatedAt" = NOW()
        WHERE "id" IN (${idsSql})
          AND "moderationStatus" = 'PENDING_REVIEW'
        RETURNING "id"
      `);
    } else if (action === "UNPUBLISH") {
      updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "Listing"
        SET "moderationStatus" = 'UNPUBLISHED', "updatedAt" = NOW()
        WHERE "id" IN (${idsSql})
          AND "moderationStatus" = 'APPROVED'
        RETURNING "id"
      `);
    } else {
      throw new Error("Unexpected action");
    }

    succeededIds.push(...updated.map((r) => r.id));
    const succeededSet = new Set(succeededIds);
    for (const listingId of eligible) {
      if (!succeededSet.has(listingId)) skipped.push({ listingId, reason: "state_changed" });
    }

    if (succeededIds.length) {
      await tx.listingModerationEvent.createMany({
        data: succeededIds.map((listingId) => ({
          listingId,
          action,
          reasonCode: null,
          note: "BULK_ACTION",
          actorType: "ADMIN",
          actorName: null
        })),
        skipDuplicates: false
      });
    }
  });

  return { attempted, succeeded: succeededIds.length, skipped };
}

function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

// Consider crawls stale after this many days (admin tooling default).
const REVERIFY_STALE_DAYS = 14;

export async function bulkReverifyListings(ids: string[]): Promise<BulkReverifyResult> {
  if (!Array.isArray(ids)) throw new Error("ids must be an array");
  const unique = uniqueIds(ids);
  const attempted = unique.length;
  if (!attempted) return { attempted: 0, queued: 0, skipped: [] };
  if (attempted > 500) throw new Error("Too many ids (max 500)");
  if (!process.env.REDIS_URL) {
    // Do not throw (avoid 500s). Return explicit, actionable skip reason.
    return {
      attempted,
      queued: 0,
      skipped: unique.map((listingId) => ({ listingId, reason: "missing_redis_url" }))
    };
  }

  const listings = await prisma.listing.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      moderationStatus: true,
      verificationStatus: true,
      lastCrawledAt: true,
      optedOutAt: true,
      deletedAt: true
    }
  });
  const byId = new Map(listings.map((l) => [l.id, l]));

  const cutoff = new Date(Date.now() - days(REVERIFY_STALE_DAYS));
  const skipped: BulkReverifyResult["skipped"] = [];
  const eligible: string[] = [];

  for (const id of unique) {
    const l = byId.get(id);
    if (!l) {
      skipped.push({ listingId: id, reason: "not_found" });
      continue;
    }
    if (l.deletedAt) {
      skipped.push({ listingId: id, reason: "deleted" });
      continue;
    }
    if (l.optedOutAt) {
      skipped.push({ listingId: id, reason: "opted_out" });
      continue;
    }

    const stale = !l.lastCrawledAt || l.lastCrawledAt < cutoff;
    const failed = l.verificationStatus === "FAILED";
    if (!failed && !stale) {
      skipped.push({ listingId: id, reason: "recently_crawled_or_verified" });
      continue;
    }
    eligible.push(id);
  }

  if (!eligible.length) return { attempted, queued: 0, skipped };

  const queue = workerQueue();
  let queued = 0;
  const queuedIds: string[] = [];

  // Enqueue crawls (no moderation status changes).
  for (const listingId of eligible) {
    try {
      await queue.add(
        "CRAWL_WEBSITE",
        { listingId },
        {
          jobId: crawlJobIdForToday(listingId),
          removeOnComplete: 2000,
          removeOnFail: 2000
        }
      );
      queued++;
      queuedIds.push(listingId);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.toLowerCase().includes("job") && msg.toLowerCase().includes("exists")) {
        skipped.push({ listingId, reason: "already_queued_today" });
        continue;
      }
      console.error("bulkReverify enqueue failed", { listingId, msg });
      skipped.push({ listingId, reason: "enqueue_error" });
    }
  }

  // Emit one REVERIFY_REQUESTED event per queued listing (no moderation status change).
  if (queuedIds.length) {
    await prisma.listingModerationEvent.createMany({
      data: queuedIds.map((listingId) => ({
        listingId,
        action: "REVERIFY_REQUESTED",
        reasonCode: null,
        note: "BULK_ACTION",
        actorType: "ADMIN",
        actorName: null
      }))
    });
  }

  await queue.close();
  return { attempted, queued, skipped };
}


