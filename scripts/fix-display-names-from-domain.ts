import { PrismaClient } from "@prisma/client";
import { loadSeedEnv } from "./lib/load-env.js";

loadSeedEnv();

const prisma = new PrismaClient();

function looksLikeServiceList(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const sepCount = (t.match(/[·•|]/g) ?? []).length;
  if (sepCount >= 2) return true;
  const lower = t.toLowerCase();
  const hits = [
    "acupuncture",
    "massage",
    "therapy",
    "herbal",
    "medicine",
    "sound healing",
    "chiropractic",
    "yoga",
    "reiki",
    "services"
  ].filter((k) => lower.includes(k)).length;
  return hits >= 3;
}

function domainToName(websiteDomain: string): string {
  const base = websiteDomain.replace(/^www\./, "").split(".")[0] ?? websiteDomain;
  const parts = base.split(/[-_]+/g).filter(Boolean);
  const titled = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return titled || websiteDomain.replace(/^www\./, "");
}

async function main() {
  const candidates = await prisma.listing.findMany({
    where: {
      deletedAt: null
    },
    select: { id: true, displayName: true, websiteDomain: true, summary: true }
  });

  const toFix = candidates.filter((l) => looksLikeServiceList(l.displayName));
  const summaryTemplate = " is a wellness practice with information available on its website (";
  const summariesToFix = candidates.filter(
    (l) =>
      typeof l.summary === "string" &&
      l.summary.includes(summaryTemplate) &&
      !l.summary.startsWith(`${l.displayName}${summaryTemplate}`)
  );

  if (!toFix.length) console.log("No listings found with service-list style displayName.");
  if (!summariesToFix.length) console.log("No listings found with mismatched auto-generated summaries.");
  if (!toFix.length && !summariesToFix.length) return;

  console.log(`Fixing ${toFix.length} listings with bad displayName...`);
  let updated = 0;
  for (const l of toFix) {
    const next = domainToName(l.websiteDomain).slice(0, 140);
    if (!next || next === l.displayName) continue;

    const shouldUpdateSummary =
      typeof l.summary === "string" &&
      l.summary.includes(summaryTemplate) &&
      !l.summary.startsWith(`${next}${summaryTemplate}`);
    const nextSummary = `${next} is a wellness practice with information available on its website (${l.websiteDomain}). Visit the site for current details.`;

    await prisma.listing.update({
      where: { id: l.id },
      data: { displayName: next, summary: shouldUpdateSummary ? nextSummary : undefined }
    });
    updated += 1;
  }

  console.log(`Updated ${updated} listings.`);

  if (summariesToFix.length) {
    console.log(`Fixing ${summariesToFix.length} listings with mismatched auto-generated summaries...`);
    let summaryUpdated = 0;
    for (const l of summariesToFix) {
      const nextSummary = `${l.displayName} is a wellness practice with information available on its website (${l.websiteDomain}). Visit the site for current details.`;
      await prisma.listing.update({
        where: { id: l.id },
        data: { summary: nextSummary }
      });
      summaryUpdated += 1;
    }
    console.log(`Updated ${summaryUpdated} summaries.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });


