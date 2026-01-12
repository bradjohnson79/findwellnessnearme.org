import { PrismaClient } from "@prisma/client";
import { loadSeedEnv } from "./lib/load-env.js";

/**
 * Backfill ListingLocation from discovery provenance.
 *
 * Many early listings were created with `DiscoveryEvent.queryText` containing a deterministic
 * token like: "discovery:{stateSlug}:{citySlug}:{modalityCsv}" but no ListingLocation rows.
 *
 * This script:
 * - finds listings with zero active locations (deletedAt=null)
 * - parses the earliest discovery queryText for stateSlug + citySlug
 * - looks up City by (stateSlug, citySlug) and creates a primary ListingLocation
 *
 * Idempotent: never creates a location if one already exists.
 */

loadSeedEnv();
const prisma = new PrismaClient();

function parseDiscoveryQueryText(q: string | null): { stateSlug: string; citySlug: string } | null {
  if (!q) return null;
  if (!q.startsWith("discovery:")) return null;
  const parts = q.split(":");
  if (parts.length < 3) return null;
  const stateSlug = (parts[1] ?? "").trim();
  const citySlug = (parts[2] ?? "").trim();
  if (!stateSlug || !citySlug) return null;
  return { stateSlug, citySlug };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set.");
  }

  const BATCH = 200;
  let scanned = 0;
  let fixed = 0;
  let skipped = 0;
  let noProvenance = 0;
  let noCity = 0;

  // Iterate deterministically by createdAt asc.
  let cursor: { id: string } | undefined = undefined;
  for (;;) {
    const listings = await prisma.listing.findMany({
      ...(cursor ? { cursor, skip: 1 } : {}),
      orderBy: [{ createdAt: "asc" }],
      take: BATCH,
      select: { id: true, createdAt: true }
    });
    if (!listings.length) break;

    for (const l of listings) {
      scanned++;

      const hasLoc = await prisma.listingLocation.findFirst({
        where: { listingId: l.id, deletedAt: null },
        select: { id: true }
      });
      if (hasLoc) {
        skipped++;
        continue;
      }

      const ev = await prisma.listingDiscoveryEvent.findFirst({
        where: { listingId: l.id },
        orderBy: [{ discoveredAt: "asc" }],
        select: { queryText: true }
      });

      const parsed = parseDiscoveryQueryText(ev?.queryText ?? null);
      if (!parsed) {
        noProvenance++;
        continue;
      }

      const city = await prisma.city.findFirst({
        where: {
          slug: parsed.citySlug,
          state: { slug: parsed.stateSlug, country: { iso2: "US" } }
        },
        select: { id: true }
      });
      if (!city) {
        noCity++;
        continue;
      }

      await prisma.listingLocation.create({
        data: { listingId: l.id, cityId: city.id, isPrimary: true }
      });
      fixed++;
    }

    cursor = { id: listings[listings.length - 1]!.id };
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        fixed,
        skipped_existing_location: skipped,
        skipped_no_discovery_provenance: noProvenance,
        skipped_city_not_found: noCity
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error("[backfill-listing-locations] failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });


