import { prisma } from "../lib/prisma.js";
import { numberEnv } from "../lib/env.js";

function now() {
  return new Date();
}

function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

function staleVerificationDays() {
  return numberEnv("STALE_VERIFICATION_DAYS", 180);
}

function maxFlagsPerRun() {
  return numberEnv("QUALITY_FLAG_LIMIT_PER_RUN", 300);
}

async function recentSystemFlagExists(listingId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - days(1));
  const ev = await prisma.listingModerationEvent.findFirst({
    where: {
      listingId,
      actorType: "SYSTEM",
      action: "FLAG_ATTENTION",
      createdAt: { gt: cutoff }
    },
    select: { id: true }
  });
  return Boolean(ev);
}

export async function runQualitySweepJob() {
  const cutoff = new Date(Date.now() - days(staleVerificationDays()));

  // Candidate set: approved listings (public surface area) + any verified listings.
  const listings = await prisma.listing.findMany({
    where: {
      deletedAt: null,
      OR: [{ moderationStatus: "APPROVED" }, { verificationStatus: "VERIFIED" }]
    },
    select: { id: true, websiteDomain: true, verificationStatus: true, lastVerifiedAt: true },
    take: 1000,
    orderBy: [{ updatedAt: "asc" }]
  });

  let flagged = 0;
  let skipped = 0;

  for (const l of listings) {
    if (flagged >= maxFlagsPerRun()) break;
    if (await recentSystemFlagExists(l.id)) {
      skipped++;
      continue;
    }

    const issues: string[] = [];

    // Overdue reverification (derived staleness).
    if (l.verificationStatus === "VERIFIED" && l.lastVerifiedAt && l.lastVerifiedAt < cutoff) {
      issues.push("reverification_overdue");
    }

    // Repeated failures: last 3 crawls all not SUCCESS.
    const lastCrawls = await prisma.crawlAttempt.findMany({
      where: { listingId: l.id },
      orderBy: [{ startedAt: "desc" }],
      take: 3,
      select: { status: true }
    });
    if (lastCrawls.length >= 3 && lastCrawls.every((c) => c.status !== "SUCCESS")) {
      issues.push("repeated_crawl_failures");
    }

    // Robots newly blocking: latest crawl blocked, and there exists any prior SUCCESS.
    const latest = lastCrawls[0]?.status ?? null;
    if (latest === "BLOCKED_ROBOTS") {
      const priorSuccess = await prisma.crawlAttempt.findFirst({
        where: { listingId: l.id, status: "SUCCESS" },
        select: { id: true }
      });
      if (priorSuccess) issues.push("robots_now_blocking");
    }

    // Verification downgraded (e.g. was verified historically but now failed).
    if (l.verificationStatus === "FAILED") {
      const priorVerified = await prisma.crawlAttempt.findFirst({
        where: { listingId: l.id, status: "SUCCESS" },
        select: { id: true }
      });
      if (priorVerified) issues.push("verification_failed_after_prior_success");
    }

    if (!issues.length) {
      skipped++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: l.id },
        data: { needsAttention: true }
      });

      await tx.listingModerationEvent.create({
        data: {
          listingId: l.id,
          action: "FLAG_ATTENTION",
          reasonCode: null,
          note: `System flag: ${issues.join(", ")}`,
          actorType: "SYSTEM",
          actorName: null,
          createdAt: now()
        }
      });
    });
    flagged++;
  }

  return { scanned: listings.length, flagged, skipped };
}


