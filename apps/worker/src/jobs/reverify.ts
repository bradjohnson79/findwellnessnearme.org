import { prisma } from "../lib/prisma.js";
import { numberEnv } from "../lib/env.js";
import type { Queue } from "bullmq";

function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

function staleVerificationDays() {
  return numberEnv("STALE_VERIFICATION_DAYS", 180);
}

function maxReverifyPerRun() {
  return numberEnv("MAX_REVERIFY_PER_RUN", 200);
}

function crawlJobIdForToday(listingId: string) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `crawl-${listingId}-${y}${m}${day}`;
}

export async function runReverifyListingsJob(deps: { queue: Queue }) {
  const cutoff = new Date(Date.now() - days(staleVerificationDays()));

  const listings = await prisma.listing.findMany({
    where: {
      verificationStatus: "VERIFIED",
      lastVerifiedAt: { lt: cutoff },
      deletedAt: null
    },
    select: { id: true },
    take: maxReverifyPerRun(),
    orderBy: [{ lastVerifiedAt: "asc" }]
  });

  let enqueued = 0;
  for (const l of listings) {
    await deps.queue.add(
      "CRAWL_WEBSITE",
      { listingId: l.id },
      {
        jobId: crawlJobIdForToday(l.id),
        removeOnComplete: 2000,
        removeOnFail: 2000
      }
    );
    enqueued++;
  }

  return { cutoff: cutoff.toISOString(), selected: listings.length, enqueued };
}


