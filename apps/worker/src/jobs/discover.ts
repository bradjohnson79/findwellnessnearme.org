import { prisma } from "../lib/prisma.js";
import { buildListingSlug } from "../lib/slug.js";
import { getRegistrableHost, normalizeWebsiteUrl } from "../lib/url.js";
import type { DiscoverCandidate, DiscoverJobData } from "../types.js";
import type { Queue } from "bullmq";
import type { Prisma } from "@prisma/client";

function bestEffortName(candidate: DiscoverCandidate): string {
  if (candidate.displayName?.trim()) return candidate.displayName.trim();
  const host = getRegistrableHost(candidate.websiteUrl);
  return host.replace(/^www\./, "");
}

async function uniqueSlug(base: string): Promise<string> {
  // Ensure uniqueness against Listing.slug (@unique). Keep it simple.
  let slug = base;
  for (let i = 0; i < 20; i++) {
    const exists = await prisma.listing.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
    slug = `${base}-${i + 2}`.slice(0, 90);
  }
  // Extremely unlikely; but must not loop forever.
  return `${base}-${Date.now()}`.slice(0, 90);
}

async function uniqueSlugTx(tx: Prisma.TransactionClient, base: string): Promise<string> {
  // Ensure uniqueness against Listing.slug (@unique). Keep it simple.
  let slug = base;
  for (let i = 0; i < 20; i++) {
    const exists = await tx.listing.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
    slug = `${base}-${i + 2}`.slice(0, 90);
  }
  // Extremely unlikely; but must not loop forever.
  return `${base}-${Date.now()}`.slice(0, 90);
}

function crawlJobIdForToday(listingId: string) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `crawl-${listingId}-${y}${m}${day}`;
}

export async function runDiscoverJob(
  data: DiscoverJobData,
  deps: { queue: Queue }
): Promise<{ created: number; deduped: number }> {
  const candidates = data.candidates ?? [];
  if (!candidates.length) {
    // Discovery integration can be added later; MVP allows stubbing candidates.
    return { created: 0, deduped: 0 };
  }

  let created = 0;
  let deduped = 0;

  for (const raw of candidates) {
    // Idempotency: normalize URL and dedupe by websiteDomain.
    const websiteUrl = normalizeWebsiteUrl(raw.websiteUrl);
    const websiteDomain = getRegistrableHost(websiteUrl);
    const displayName = bestEffortName({ ...raw, websiteUrl });

    await prisma.$transaction(async (tx) => {
      const existing = await tx.listing.findFirst({
        where: { websiteDomain },
        orderBy: [{ createdAt: "asc" }]
      });

      const listing =
        existing ??
        (await (async () => {
          const baseSlug = buildListingSlug(displayName, websiteDomain);
          const slug = await uniqueSlugTx(tx, baseSlug);
          created++;
          return tx.listing.create({
            data: {
              kind: "BUSINESS",
              displayName,
              slug,
              summary: null,
              websiteUrl,
              websiteDomain,
              moderationStatus: "DRAFT",
              verificationStatus: "UNVERIFIED"
            }
          });
        })());

      if (existing) deduped++;

      // Audit: discovery provenance.
      await tx.listingDiscoveryEvent.create({
        data: {
          listingId: listing.id,
          sourceType: "SEARCH",
          sourceUrl: websiteUrl,
          queryText: data.queryText ?? null
        }
      });

      // Phase 9.x invariant: if discovery provides a city/state hint and the listing has
      // no active locations yet, attach a primary ListingLocation deterministically.
      // This is required for state/city pages to populate.
      if (raw.city && raw.state) {
        const hasAnyLocation = await tx.listingLocation.findFirst({
          where: { listingId: listing.id, deletedAt: null },
          select: { id: true }
        });
        if (!hasAnyLocation) {
          const state = await tx.state.findFirst({
            where: { uspsCode: raw.state, country: { iso2: "US" } },
            select: { id: true }
          });
          if (state) {
            const city = await tx.city.findFirst({
              where: { stateId: state.id, name: { equals: raw.city, mode: "insensitive" } },
              select: { id: true }
            });
            if (city) {
              await tx.listingLocation.create({
                data: {
                  listingId: listing.id,
                  cityId: city.id,
                  isPrimary: true
                }
              });
            }
          }
        }
      }

      // Enqueue crawl for verification (no auto-publish).
      await deps.queue.add(
        "CRAWL_WEBSITE",
        { listingId: listing.id },
        {
          // At most one crawl per listing per day (prevents hammering and allows continuous refresh later).
          jobId: crawlJobIdForToday(listing.id),
          removeOnComplete: 1000,
          removeOnFail: 1000
        }
      );
    });
  }

  return { created, deduped };
}


