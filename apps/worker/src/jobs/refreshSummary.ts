import { prisma } from "../lib/prisma.js";
import { numberEnv } from "../lib/env.js";

function maxSummaryRefreshPerRun() {
  return numberEnv("SUMMARY_REFRESH_LIMIT_PER_RUN", 200);
}

function now() {
  return new Date();
}

async function lastTwoSuccessfulHashes(listingId: string): Promise<{ latest?: string; previous?: string }> {
  const crawls = await prisma.crawlAttempt.findMany({
    where: { listingId, status: "SUCCESS", contentSha256: { not: null } },
    orderBy: [{ startedAt: "desc" }],
    select: { contentSha256: true },
    take: 2
  });
  return { latest: crawls[0]?.contentSha256 ?? undefined, previous: crawls[1]?.contentSha256 ?? undefined };
}

async function isHumanEditedSummary(listingId: string): Promise<boolean> {
  // We have no explicit "summarySource" field.
  // Conservative policy: if a HUMAN ever submitted edits to public fields, treat summary as human-controlled.
  const ev = await prisma.listingModerationEvent.findFirst({
    where: {
      listingId,
      actorType: "HUMAN",
      action: "SUBMIT_FOR_REVIEW",
      note: { contains: "Edited public fields" }
    },
    select: { id: true }
  });
  return Boolean(ev);
}

async function lastSystemSummaryRefreshAt(listingId: string): Promise<Date | null> {
  const ev = await prisma.listingModerationEvent.findFirst({
    where: { listingId, actorType: "SYSTEM", action: "REFRESH_SUMMARY" },
    orderBy: [{ createdAt: "desc" }],
    select: { createdAt: true }
  });
  return ev?.createdAt ?? null;
}

function buildNeutralSummary(args: {
  displayName: string;
  websiteDomain: string;
  locationText?: string | null;
  modalities?: string[];
}) {
  const parts: string[] = [];
  parts.push(
    `${args.displayName} is listed in this directory based on information available on its public website (${args.websiteDomain}).`
  );
  if (args.locationText) parts.push(`Location information on file: ${args.locationText}.`);
  if (args.modalities?.length) parts.push(`Modalities listed: ${args.modalities.slice(0, 6).join(", ")}.`);
  return parts.slice(0, 3).join(" ");
}

export async function runRefreshSummaryJob(data?: { listingId?: string; reason?: string }) {
  const listingId = data?.listingId;
  const candidates = await prisma.listing.findMany({
    where: {
      deletedAt: null,
      // Only refresh summaries for listings that are at least verified once.
      verificationStatus: "VERIFIED",
      ...(listingId ? { id: listingId } : {}),
      OR: [{ summary: null }, { summary: { equals: "" } }]
    },
    select: { id: true, displayName: true, websiteDomain: true, summary: true },
    take: maxSummaryRefreshPerRun(),
    orderBy: [{ updatedAt: "asc" }]
  });

  let refreshed = 0;
  let skippedHuman = 0;
  let skippedNoChange = 0;

  for (const l of candidates) {
    try {
      const hashes = await lastTwoSuccessfulHashes(l.id);
      const changed = Boolean(hashes.latest && hashes.previous && hashes.latest !== hashes.previous);

      // If summary is missing, we can generate even without a detected hash change.
      const needs = !l.summary || changed;

      if (!needs) {
        skippedNoChange++;
        continue;
      }

      const humanEdited = await isHumanEditedSummary(l.id);
      if (humanEdited && l.summary) {
        skippedHuman++;
        continue;
      }

      // If summary exists and was system-generated before, we can overwrite on change.
      if (l.summary) {
        const lastSystem = await lastSystemSummaryRefreshAt(l.id);
        if (!lastSystem) {
          skippedHuman++;
          continue;
        }
        if (!changed) {
          skippedNoChange++;
          continue;
        }
      }

      const [primaryLoc, modalities] = await Promise.all([
        prisma.listingLocation.findFirst({
          where: { listingId: l.id, deletedAt: null },
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
          select: { city: { select: { name: true, state: { select: { uspsCode: true } } } } }
        }),
        prisma.listingModality.findMany({
          where: { listingId: l.id },
          select: { modality: { select: { displayName: true } } }
        })
      ]);

      const locationText = primaryLoc ? `${primaryLoc.city.name}, ${primaryLoc.city.state.uspsCode}` : null;
      const modalityNames = modalities.map((m) => m.modality.displayName).sort();

      const summary = buildNeutralSummary({
        displayName: l.displayName,
        websiteDomain: l.websiteDomain,
        locationText,
        modalities: modalityNames
      });

      await prisma.$transaction(async (tx) => {
        await tx.listing.update({
          where: { id: l.id },
          data: { summary }
        });

        await tx.listingModerationEvent.create({
          data: {
            listingId: l.id,
            action: "REFRESH_SUMMARY",
            reasonCode: null,
            note: `System refreshed summary (neutral, factual).${data?.reason ? ` reason=${data.reason}` : ""}`,
            actorType: "SYSTEM",
            actorName: null,
            createdAt: now()
          }
        });
      });

      refreshed++;
    } catch (e) {
      // Failures are non-destructive but should be auditable.
      await prisma.listingModerationEvent.create({
        data: {
          listingId: l.id,
          action: "FLAG_ATTENTION",
          reasonCode: null,
          note: "System flag: summary_refresh_failed",
          actorType: "SYSTEM",
          actorName: null,
          createdAt: now()
        }
      });
    }
  }

  return { refreshed, skippedHuman, skippedNoChange, scanned: candidates.length };
}


