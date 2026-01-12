import { PrismaClient } from "@prisma/client";
import { loadSeedEnv } from "./lib/load-env.js";
import { slugify } from "./lib/slug.js";

/**
 * Phase 4A — Modality taxonomy v1 seeding
 *
 * Contracts:
 * - `Modality.slug` is treated as immutable once created (SEO + API contract).
 * - This script is idempotent and safe to re-run.
 * - Workers must never create new modalities (they can only reference existing ones).
 */

loadSeedEnv();

const prisma = new PrismaClient();

type ModalitySeed = {
  name: string;
  slug?: string;
  parentSlug?: string;
};

// Phase 9 — authoritative modality taxonomy list (safe to expand intentionally).
// Contract:
// - upsert by slug (slug treated as immutable)
// - never delete existing modalities
// - never silently rename existing modalities (log mismatch instead)
// - safe to run multiple times
const MODALITIES: ModalitySeed[] = [
  // Core taxonomy
  { slug: "acupuncture", name: "Acupuncture", parentSlug: "traditional-chinese-medicine" },
  { slug: "acupressure", name: "Acupressure", parentSlug: "traditional-chinese-medicine" },
  { slug: "ayurveda", name: "Ayurveda" },
  { slug: "bodywork", name: "Bodywork" },
  { slug: "breathwork", name: "Breathwork", parentSlug: "mind-body-practices" },
  { slug: "chiropractic", name: "Chiropractic" },
  { slug: "craniosacral-therapy", name: "Craniosacral Therapy", parentSlug: "bodywork" },
  { slug: "energy-healing", name: "Energy Healing", parentSlug: "energy-work" },
  { slug: "energy-work", name: "Energy Work" },
  { slug: "functional-nutrition", name: "Functional Nutrition", parentSlug: "nutrition" },
  { slug: "herbalism", name: "Herbalism", parentSlug: "traditional-chinese-medicine" },
  { slug: "massage-therapy", name: "Massage Therapy", parentSlug: "bodywork" },
  { slug: "mind-body-practices", name: "Mind-Body Practices" },
  { slug: "naturopathy", name: "Naturopathy" },
  { slug: "nutrition", name: "Nutrition" },
  { slug: "somatic-therapy", name: "Somatic Therapy", parentSlug: "mind-body-practices" },
  { slug: "sound-healing", name: "Sound Healing", parentSlug: "energy-work" },
  { slug: "traditional-chinese-medicine", name: "Traditional Chinese Medicine" },
  { slug: "yoga-therapy", name: "Yoga Therapy", parentSlug: "mind-body-practices" },

  // Business-inclusive expansions
  { slug: "light-therapy", name: "Light Therapy" },
  { slug: "red-light-therapy", name: "Red Light Therapy", parentSlug: "light-therapy" },
  { slug: "sauna", name: "Sauna" },
  { slug: "infrared-sauna", name: "Infrared Sauna", parentSlug: "sauna" },
  { slug: "sensory-deprivation-therapy", name: "Sensory Deprivation Therapy" },
  { slug: "spa", name: "Spa" },
  { slug: "pilates-studio", name: "Pilates Studio" },
  { slug: "yoga-studio", name: "Yoga Studio" }
];

function stableSlug(seed: ModalitySeed): string {
  if (seed.slug) return seed.slug;
  return slugify(seed.name);
}

async function ensureModality(slug: string, displayName: string) {
  const existing = await prisma.modality.findUnique({ where: { slug } });
  if (existing) {
    // Slug is immutable; DO NOT silently rename displayName.
    // If it differs, we log and leave it for explicit admin action.
    if (existing.displayName !== displayName) {
      console.warn(
        `[seed-modalities] displayName mismatch for slug="${slug}": existing="${existing.displayName}" expected="${displayName}" (not changed)`
      );
    }

    // Ensure it remains active (idempotent).
    if (existing.isActive === false) {
      await prisma.modality.update({ where: { slug }, data: { isActive: true } });
    }

    return { id: existing.id, created: false };
  }
  const created = await prisma.modality.create({
    data: { slug, displayName, isActive: true }
  });
  return { id: created.id, created: true };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set. Provide it in env or via packages/db/.env.");
  }

  let created = 0;
  let skipped = 0;
  let parentSet = 0;
  let parentSkipped = 0;

  // 1) Create all modalities (no parent wiring yet).
  const idBySlug = new Map<string, string>();
  for (const m of MODALITIES) {
    const slug = stableSlug(m);
    const res = await ensureModality(slug, m.name);
    idBySlug.set(slug, res.id);
    if (res.created) created++;
    else skipped++;
  }

  // 2) Apply parent relationships conservatively:
  // - Set parentId only when currently null (avoids stomping manual admin decisions).
  for (const m of MODALITIES) {
    const slug = stableSlug(m);
    const parentSlug = m.parentSlug;
    if (!parentSlug) continue;
    const id = idBySlug.get(slug);
    const parentId = idBySlug.get(parentSlug);
    if (!id || !parentId) continue;

    const existing = await prisma.modality.findUnique({
      where: { slug },
      select: { parentId: true }
    });
    if (!existing) continue;
    if (existing.parentId) {
      parentSkipped++;
      continue;
    }

    await prisma.modality.update({
      where: { slug },
      data: { parentId }
    });
    parentSet++;
  }

  console.log("[seed-modalities] done");
  console.log(
    JSON.stringify(
      { modalities: { created, skipped }, hierarchy: { parentSet, parentSkipped } },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error("[seed-modalities] failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });


