import { PrismaClient } from "@prisma/client";
import { loadSeedEnv } from "./lib/load-env.js";
import { slugify } from "./lib/slug.js";

/**
 * Phase 4A — Canonical Geography seeding (US)
 *
 * Goals:
 * - Seed `Country` (United States) idempotently.
 * - Seed all 50 US states + DC idempotently with stable slugs.
 * - Seed a Tier-1 set of canonical cities (1–5 per state) idempotently.
 *
 * City expansion strategy (policy, no code yet):
 * - Add cities incrementally via this script (append-only list) or future dedicated importer.
 * - Slug conflicts are resolved by keeping the first slug as canonical and adding a suffix
 *   only when a conflict exists within the same state (e.g. "springfield-2").
 * - City merges/splits should be handled via moderation policy:
 *   - If a city should be merged, keep the canonical city slug stable and re-bind listings.
 *   - If a split is needed, add the new city with a distinct slug; do not rename existing slugs.
 * Slugs are contracts: avoid renaming once published/linked.
 */

loadSeedEnv();

const prisma = new PrismaClient();

const US = {
  iso2: "US",
  name: "United States",
  slug: "united-states"
} as const;

const STATES: Array<{ name: string; uspsCode: string }> = [
  { name: "Alabama", uspsCode: "AL" },
  { name: "Alaska", uspsCode: "AK" },
  { name: "Arizona", uspsCode: "AZ" },
  { name: "Arkansas", uspsCode: "AR" },
  { name: "California", uspsCode: "CA" },
  { name: "Colorado", uspsCode: "CO" },
  { name: "Connecticut", uspsCode: "CT" },
  { name: "Delaware", uspsCode: "DE" },
  { name: "District of Columbia", uspsCode: "DC" },
  { name: "Florida", uspsCode: "FL" },
  { name: "Georgia", uspsCode: "GA" },
  { name: "Hawaii", uspsCode: "HI" },
  { name: "Idaho", uspsCode: "ID" },
  { name: "Illinois", uspsCode: "IL" },
  { name: "Indiana", uspsCode: "IN" },
  { name: "Iowa", uspsCode: "IA" },
  { name: "Kansas", uspsCode: "KS" },
  { name: "Kentucky", uspsCode: "KY" },
  { name: "Louisiana", uspsCode: "LA" },
  { name: "Maine", uspsCode: "ME" },
  { name: "Maryland", uspsCode: "MD" },
  { name: "Massachusetts", uspsCode: "MA" },
  { name: "Michigan", uspsCode: "MI" },
  { name: "Minnesota", uspsCode: "MN" },
  { name: "Mississippi", uspsCode: "MS" },
  { name: "Missouri", uspsCode: "MO" },
  { name: "Montana", uspsCode: "MT" },
  { name: "Nebraska", uspsCode: "NE" },
  { name: "Nevada", uspsCode: "NV" },
  { name: "New Hampshire", uspsCode: "NH" },
  { name: "New Jersey", uspsCode: "NJ" },
  { name: "New Mexico", uspsCode: "NM" },
  { name: "New York", uspsCode: "NY" },
  { name: "North Carolina", uspsCode: "NC" },
  { name: "North Dakota", uspsCode: "ND" },
  { name: "Ohio", uspsCode: "OH" },
  { name: "Oklahoma", uspsCode: "OK" },
  { name: "Oregon", uspsCode: "OR" },
  { name: "Pennsylvania", uspsCode: "PA" },
  { name: "Rhode Island", uspsCode: "RI" },
  { name: "South Carolina", uspsCode: "SC" },
  { name: "South Dakota", uspsCode: "SD" },
  { name: "Tennessee", uspsCode: "TN" },
  { name: "Texas", uspsCode: "TX" },
  { name: "Utah", uspsCode: "UT" },
  { name: "Vermont", uspsCode: "VT" },
  { name: "Virginia", uspsCode: "VA" },
  { name: "Washington", uspsCode: "WA" },
  { name: "West Virginia", uspsCode: "WV" },
  { name: "Wisconsin", uspsCode: "WI" },
  { name: "Wyoming", uspsCode: "WY" }
];

// Tier-1 city set: typically state capital + a major metro (1–3 for a few large states).
const CITIES_BY_STATE: Record<string, string[]> = {
  AL: ["Birmingham", "Montgomery"],
  AK: ["Anchorage", "Juneau"],
  AZ: ["Phoenix", "Tucson"],
  AR: ["Little Rock", "Fayetteville"],
  CA: ["Los Angeles", "San Francisco", "Sacramento"],
  CO: ["Denver", "Colorado Springs"],
  CT: ["Bridgeport", "Hartford"],
  DE: ["Wilmington", "Dover"],
  DC: ["Washington"],
  FL: ["Miami", "Tallahassee"],
  GA: ["Atlanta", "Savannah"],
  HI: ["Honolulu", "Hilo"],
  ID: ["Boise", "Idaho Falls"],
  IL: ["Chicago", "Springfield"],
  IN: ["Indianapolis", "Fort Wayne"],
  IA: ["Des Moines", "Cedar Rapids"],
  KS: ["Wichita", "Topeka"],
  KY: ["Louisville", "Frankfort"],
  LA: ["New Orleans", "Baton Rouge"],
  ME: ["Portland", "Augusta"],
  MD: ["Baltimore", "Annapolis"],
  MA: ["Boston", "Worcester"],
  MI: ["Detroit", "Lansing"],
  MN: ["Minneapolis", "Saint Paul"],
  MS: ["Jackson", "Gulfport"],
  MO: ["Kansas City", "Jefferson City"],
  MT: ["Billings", "Helena"],
  NE: ["Omaha", "Lincoln"],
  NV: ["Las Vegas", "Carson City"],
  NH: ["Manchester", "Concord"],
  NJ: ["Newark", "Trenton"],
  NM: ["Albuquerque", "Santa Fe"],
  NY: ["New York", "Albany"],
  NC: ["Charlotte", "Raleigh"],
  ND: ["Fargo", "Bismarck"],
  OH: ["Columbus", "Cleveland"],
  OK: ["Oklahoma City", "Tulsa"],
  OR: ["Portland", "Salem"],
  PA: ["Philadelphia", "Harrisburg"],
  RI: ["Providence", "Warwick"],
  SC: ["Charleston", "Columbia"],
  SD: ["Sioux Falls", "Pierre"],
  TN: ["Nashville", "Memphis"],
  TX: ["Houston", "Austin", "Dallas"],
  UT: ["Salt Lake City", "Provo"],
  VT: ["Burlington", "Montpelier"],
  VA: ["Virginia Beach", "Richmond"],
  WA: ["Seattle", "Olympia"],
  WV: ["Charleston", "Huntington"],
  WI: ["Milwaukee", "Madison"],
  WY: ["Cheyenne", "Casper"]
};

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set. Provide it in env or via packages/db/.env.");
  }

  let createdCountries = 0;
  let skippedCountries = 0;
  let createdStates = 0;
  let skippedStates = 0;
  let createdCities = 0;
  let skippedCities = 0;

  const country = await prisma.country.findUnique({ where: { iso2: US.iso2 } });
  const us =
    country ??
    (await prisma.country.create({
      data: { iso2: US.iso2, name: US.name, slug: US.slug }
    }));

  if (!country) createdCountries++;
  else skippedCountries++;

  // States
  const stateIdByCode = new Map<string, string>();
  for (const s of STATES) {
    const slug = slugify(s.name);
    const existing = await prisma.state.findUnique({
      where: { countryId_uspsCode: { countryId: us.id, uspsCode: s.uspsCode } }
    });
    if (existing) {
      skippedStates++;
      stateIdByCode.set(s.uspsCode, existing.id);
      continue;
    }
    const created = await prisma.state.create({
      data: { countryId: us.id, name: s.name, slug, uspsCode: s.uspsCode }
    });
    createdStates++;
    stateIdByCode.set(s.uspsCode, created.id);
  }

  // Cities
  for (const s of STATES) {
    const stateId = stateIdByCode.get(s.uspsCode);
    if (!stateId) continue;
    const cities = CITIES_BY_STATE[s.uspsCode] ?? [];
    for (const cityName of cities) {
      const baseSlug = slugify(cityName);

      // Ensure slug uniqueness within a state (idempotent, stable). Only apply suffix if needed.
      let slug = baseSlug;
      for (let i = 0; i < 20; i++) {
        const existing = await prisma.city.findUnique({
          where: { stateId_slug: { stateId, slug } }
        });
        if (existing) {
          skippedCities++;
          slug = ""; // mark found
          break;
        }

        // If this slug is used by another city name in this state (rare in our curated list),
        // suffix it deterministically.
        const conflict = await prisma.city.findFirst({ where: { stateId, slug } });
        if (!conflict) {
          await prisma.city.create({ data: { stateId, name: cityName, slug } });
          createdCities++;
          slug = ""; // created
          break;
        }
        slug = `${baseSlug}-${i + 2}`;
      }
    }
  }

  console.log("[seed-geography] done");
  console.log(
    JSON.stringify(
      {
        country: { created: createdCountries, skipped: skippedCountries },
        states: { created: createdStates, skipped: skippedStates },
        cities: { created: createdCities, skipped: skippedCities }
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error("[seed-geography] failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });


