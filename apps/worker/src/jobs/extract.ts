import { prisma } from "../lib/prisma.js";
import type { ExtractJobData } from "../types.js";
import type { Queue } from "bullmq";
import { aiReviewConfig } from "../lib/ai/config.js";

function safeTrim(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

function domainToName(websiteDomain: string): string {
  const base = websiteDomain.replace(/^www\./, "").split(".")[0] ?? websiteDomain;
  const parts = base.split(/[-_]+/g).filter(Boolean);
  const titled = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return titled || websiteDomain.replace(/^www\./, "");
}

function looksLikeServiceList(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  // Lots of separators is a strong signal of "services list" rather than business name.
  const sepCount = (t.match(/[·•|]/g) ?? []).length;
  if (sepCount >= 2) return true;
  // If it contains many common modality/marketing terms, treat as non-name.
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

function pickDisplayName(extracted: any, fallback: string, websiteDomain: string): string {
  // Use extracted h1/title only if it looks like a business name (not a services list).
  const pages: any[] = Array.isArray(extracted?.pages) ? extracted.pages : [];
  const homepage = pages.find((p) => p.path === "/") ?? pages[0] ?? null;
  const h1 = safeTrim(homepage?.h1);
  const title = safeTrim(homepage?.title);

  const candidates = [h1, title].filter((x): x is string => Boolean(x));
  for (const c of candidates) {
    const trimmed = c.trim().slice(0, 140);
    if (!trimmed) continue;
    if (looksLikeServiceList(trimmed)) continue;
    return trimmed;
  }

  // If the existing displayName is already a services list, fall back to domain-derived name.
  if (fallback && looksLikeServiceList(fallback)) {
    return domainToName(websiteDomain).slice(0, 140);
  }
  return (fallback || domainToName(websiteDomain)).slice(0, 140);
}

function buildNeutralSummary(args: { displayName: string; websiteDomain: string }): string {
  // Compliance: informational only, no claims, no endorsements, no copied prose.
  return `${args.displayName} is a wellness practice with information available on its website (${args.websiteDomain}). Visit the site for current details.`;
}

function combineSignals(extracted: any): string {
  const pages: any[] = Array.isArray(extracted?.pages) ? extracted.pages : [];
  const parts: string[] = [];
  for (const p of pages) {
    if (typeof p?.title === "string") parts.push(p.title);
    if (typeof p?.h1 === "string") parts.push(p.h1);
    if (Array.isArray(p?.h2)) parts.push(...p.h2.filter((x: any) => typeof x === "string"));
  }
  return parts.join(" ").toLowerCase();
}

export async function runExtractAndNormalizeJob(
  data: ExtractJobData,
  deps?: { queue?: Queue }
): Promise<{ updated: boolean; movedToPendingReview: boolean; modalityCount: number }> {
  const [listing, attempt] = await Promise.all([
    prisma.listing.findUnique({
      where: { id: data.listingId },
      select: {
        id: true,
        displayName: true,
        summary: true,
        websiteDomain: true,
        moderationStatus: true,
        verificationStatus: true
      }
    }),
    prisma.crawlAttempt.findUnique({
      where: { id: data.crawlAttemptId },
      select: { id: true, listingId: true, status: true, extractedData: true }
    })
  ]);

  if (!listing) throw new Error("Listing not found");
  if (!attempt) throw new Error("CrawlAttempt not found");
  if (attempt.listingId !== listing.id) throw new Error("CrawlAttempt does not belong to listing");

  // Only proceed after a successful verification crawl.
  if (attempt.status !== "SUCCESS" || listing.verificationStatus !== "VERIFIED") {
    return { updated: false, movedToPendingReview: false, modalityCount: 0 };
  }

  const extracted: any = attempt.extractedData ?? {};
  const nextDisplayName = pickDisplayName(extracted, listing.displayName, listing.websiteDomain);
  const nextSummary = listing.summary ?? buildNeutralSummary({ displayName: nextDisplayName, websiteDomain: listing.websiteDomain });

  // Optional geo coordinates: harvested from JSON-LD during verification crawl.
  // We only write to an existing primary ListingLocation (no location creation in Phase 9).
  const pages: any[] = Array.isArray(extracted?.pages) ? extracted.pages : [];
  const homepage = pages.find((p) => p.path === "/") ?? pages[0] ?? null;
  const geo = homepage?.geo ?? null;
  const address = homepage?.address ?? null;
  const lat = geo?.lat;
  const lng = geo?.lng;
  const hasGeo =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  // Modalities: taxonomy-only. We only attach modalities that already exist in DB.
  // We do NOT invent new modalities or store free-text modalities.
  const signalText = combineSignals(extracted);
  const modalities = await prisma.modality.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, displayName: true }
  });

  const matchedModalityIds = modalities
    .filter((m) => {
      const slug = m.slug.toLowerCase();
      const name = m.displayName.toLowerCase();
      return signalText.includes(slug) || signalText.includes(name);
    })
    .slice(0, 10)
    .map((m) => m.id);

  const updated = await prisma.$transaction(async (tx) => {
    const existingMods = await tx.listingModality.findMany({
      where: { listingId: listing.id },
      select: { modalityId: true }
    });
    const hasAnyModality = existingMods.length > 0;

    // Only fill modalities if none exist yet (idempotent + avoids oscillation).
    if (!hasAnyModality && matchedModalityIds.length) {
      await tx.listingModality.createMany({
        data: matchedModalityIds.map((modalityId) => ({ listingId: listing.id, modalityId })),
        skipDuplicates: true
      });
    }

    // We do not create locations here unless geography tables are seeded.
    // (If Country/State/City are present later, add a cautious binder.)
    if (hasGeo) {
      const primaryLoc = await tx.listingLocation.findFirst({
        where: { listingId: listing.id, deletedAt: null },
        orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
        select: { id: true, latitude: true, longitude: true }
      });
      // Idempotent: only fill if missing.
      if (primaryLoc && (primaryLoc.latitude == null || primaryLoc.longitude == null)) {
        await tx.listingLocation.update({
          where: { id: primaryLoc.id },
          data: { latitude: lat, longitude: lng }
        });
      }
    }

    // Phase 9.x: if structured data includes a full postal address and we already have
    // a primary location, fill street/postal and mark addressVisibility=PUBLIC (conservative).
    if (address && typeof address === "object") {
      const streetAddress = safeTrim(address.streetAddress);
      const postalCode = safeTrim(address.postalCode);
      const locality = safeTrim(address.addressLocality);
      const region = safeTrim(address.addressRegion);

      if (streetAddress && postalCode) {
        const primaryLoc = await tx.listingLocation.findFirst({
          where: { listingId: listing.id, deletedAt: null },
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
          select: {
            id: true,
            street1: true,
            postalCode: true,
            addressVisibility: true,
            city: { select: { name: true, state: { select: { uspsCode: true, name: true } } } }
          }
        });

        if (primaryLoc) {
          const cityOk = locality ? primaryLoc.city.name.toLowerCase() === locality.toLowerCase() : true;
          const stateOk = region
            ? primaryLoc.city.state.uspsCode.toLowerCase() === region.toLowerCase() ||
              primaryLoc.city.state.name.toLowerCase() === region.toLowerCase()
            : true;

          if (cityOk && stateOk) {
            // Only fill if missing; never overwrite existing user/admin data.
            const shouldFillStreet = primaryLoc.street1 == null || !primaryLoc.street1.trim();
            const shouldFillPostal = primaryLoc.postalCode == null || !primaryLoc.postalCode.trim();
            if (shouldFillStreet || shouldFillPostal || primaryLoc.addressVisibility !== "PUBLIC") {
              await tx.listingLocation.update({
                where: { id: primaryLoc.id },
                data: {
                  street1: shouldFillStreet ? streetAddress : undefined,
                  postalCode: shouldFillPostal ? postalCode : undefined,
                  addressVisibility: "PUBLIC"
                }
              });
            }
          }
        }
      }
    }

    const movedToPendingReview =
      listing.moderationStatus === "DRAFT" ? "PENDING_REVIEW" : listing.moderationStatus;

    await tx.listing.update({
      where: { id: listing.id },
      data: {
        displayName: nextDisplayName,
        summary: nextSummary,
        moderationStatus: movedToPendingReview
      }
    });

    return movedToPendingReview === "PENDING_REVIEW";
  });

  // Phase 10: enqueue AI evaluation after a successful extract+verify path.
  // (AI only evaluates extracted crawl metadata + listing fields; no browsing.)
  const cfg = aiReviewConfig();
  if (cfg.enabled && deps?.queue && updated) {
    await deps.queue.add(
      "AI_EVALUATE_LISTING",
      { listingId: listing.id, crawlAttemptId: attempt.id },
      {
        jobId: `ai-eval-${attempt.id}`,
        removeOnComplete: 2000,
        removeOnFail: 2000
      }
    );
  }

  return {
    updated: true,
    movedToPendingReview: updated,
    modalityCount: matchedModalityIds.length
  };
}


