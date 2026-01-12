import type { Queue } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { numberEnv } from "../lib/env.js";

function now() {
  return new Date();
}

function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

function refreshIntervalDays() {
  return numberEnv("REFRESH_INTERVAL_DAYS", 30);
}

function staleVerificationDays() {
  return numberEnv("STALE_VERIFICATION_DAYS", 180);
}

function maxRefreshPerRun() {
  return numberEnv("MAX_REFRESH_PER_RUN", 200);
}

function crawlJobIdForToday(listingId: string) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `crawl-${listingId}-${y}${m}${day}`;
}

async function hasRepeatedRecentFailures(listingId: string): Promise<boolean> {
  const last = await prisma.crawlAttempt.findMany({
    where: { listingId },
    orderBy: [{ startedAt: "desc" }],
    take: 3,
    select: { status: true }
  });
  return last.length >= 3 && last.every((c) => c.status !== "SUCCESS");
}

export async function runRefreshApprovedListingsJob(deps: { queue: Queue }) {
  const cutoffRefresh = new Date(Date.now() - days(refreshIntervalDays()));
  const cutoffStale = new Date(Date.now() - days(staleVerificationDays()));

  // Start with obvious candidates via indexed fields; evaluate "repeated failures" per-listing.
  const base = await prisma.listing.findMany({
    where: {
      moderationStatus: "APPROVED",
      deletedAt: null,
      optedOutAt: null,
      OR: [
        { lastVerifiedAt: { lt: cutoffRefresh } },
        { verificationStatus: "STALE" },
        { verificationStatus: "FAILED" }
      ]
    },
    select: { id: true, verificationStatus: true, lastVerifiedAt: true },
    take: 1000,
    orderBy: [{ lastVerifiedAt: "asc" }]
  });

  const selected: string[] = [];
  for (const l of base) {
    if (selected.length >= maxRefreshPerRun()) break;
    // Include listings with repeated crawl failures even if lastVerifiedAt isn't old.
    const repeated = await hasRepeatedRecentFailures(l.id);
    const overdue = l.lastVerifiedAt ? l.lastVerifiedAt < cutoffStale : true;
    if (repeated || overdue || l.verificationStatus === "STALE" || l.verificationStatus === "FAILED") {
      selected.push(l.id);
    }
  }

  // Mark overdue verified listings as STALE (explicit staleness for admin filtering).
  // This does NOT change moderationStatus (no visibility change).
  const staleIds: string[] = [];
  for (const id of selected) {
    const l = await prisma.listing.findUnique({
      where: { id },
      select: { verificationStatus: true, lastVerifiedAt: true }
    });
    if (!l) continue;
    if (l.verificationStatus === "VERIFIED" && l.lastVerifiedAt && l.lastVerifiedAt < cutoffStale) {
      await prisma.listing.update({ where: { id }, data: { verificationStatus: "STALE" } });
      staleIds.push(id);
    }
  }

  let enqueued = 0;
  for (const id of selected) {
    await deps.queue.add(
      "CRAWL_WEBSITE",
      { listingId: id },
      {
        jobId: crawlJobIdForToday(id),
        removeOnComplete: 2000,
        removeOnFail: 2000
      }
    );
    enqueued++;
  }

  return {
    at: now().toISOString(),
    refreshIntervalDays: refreshIntervalDays(),
    staleVerificationDays: staleVerificationDays(),
    selected: selected.length,
    markedStale: staleIds.length,
    enqueued
  };
}


