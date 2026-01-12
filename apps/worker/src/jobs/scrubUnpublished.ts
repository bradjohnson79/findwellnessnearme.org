import { prisma } from "../lib/prisma.js";
import { numberEnv } from "../lib/env.js";

function now() {
  return new Date();
}

function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

function scrubDays() {
  // New rule-of-thumb: unpublished listings are scrubbed after 7 days.
  return numberEnv("UNPUBLISHED_SCRUB_DAYS", 7);
}

async function latestEventAt(args: { listingId: string; action: any }): Promise<Date | null> {
  const ev = await prisma.listingModerationEvent.findFirst({
    where: { listingId: args.listingId, action: args.action },
    orderBy: [{ createdAt: "desc" }],
    select: { createdAt: true }
  });
  return ev?.createdAt ?? null;
}

async function unpublishedSince(listing: {
  id: string;
  moderationStatus: string;
  createdAt: Date;
  optedOutAt: Date | null;
}): Promise<Date> {
  switch (listing.moderationStatus) {
    case "OPTED_OUT":
      return listing.optedOutAt ?? listing.createdAt;
    case "UNPUBLISHED":
      return (await latestEventAt({ listingId: listing.id, action: "UNPUBLISH" })) ?? listing.createdAt;
    case "REJECTED":
      return (await latestEventAt({ listingId: listing.id, action: "REJECT" })) ?? listing.createdAt;
    case "PENDING_REVIEW":
      return (
        (await latestEventAt({ listingId: listing.id, action: "SUBMIT_FOR_REVIEW" })) ?? listing.createdAt
      );
    case "DRAFT":
    default:
      return listing.createdAt;
  }
}

export async function runScrubUnpublishedJob() {
  const cutoff = new Date(Date.now() - days(scrubDays()));

  // Candidate set: anything not approved/public, not already deleted.
  // We cap per run to keep it boring and safe.
  const candidates = await prisma.listing.findMany({
    where: {
      deletedAt: null,
      moderationStatus: { in: ["DRAFT", "PENDING_REVIEW", "REJECTED", "UNPUBLISHED", "OPTED_OUT"] }
    },
    select: { id: true, moderationStatus: true, createdAt: true, optedOutAt: true },
    orderBy: [{ createdAt: "asc" }],
    take: 1500
  });

  const eligible: { id: string; status: string; since: Date }[] = [];
  let skipped = 0;
  for (const l of candidates) {
    const since = await unpublishedSince(l as any);
    if (since <= cutoff) eligible.push({ id: l.id, status: l.moderationStatus, since });
    else skipped++;
  }

  if (!eligible.length) {
    return { scanned: candidates.length, scrubbed: 0, skipped };
  }

  const t = now();
  await prisma.$transaction(async (tx) => {
    await tx.listing.updateMany({
      where: { id: { in: eligible.map((e) => e.id) }, deletedAt: null },
      data: { deletedAt: t }
    });

    await tx.listingModerationEvent.createMany({
      data: eligible.map((e) => ({
        listingId: e.id,
        action: "SCRUB_DELETE",
        reasonCode: "OTHER",
        note: `Auto-scrub: listing remained unpublished for >= ${scrubDays()} days (status=${e.status}, since=${e.since.toISOString()}).`,
        actorType: "SYSTEM",
        actorName: null,
        createdAt: t
      }))
    });
  });

  return { scanned: candidates.length, scrubbed: eligible.length, skipped };
}


