"use server";

import { prisma } from "../../../../src/lib/prisma";
import { redirect } from "next/navigation";

function now() {
  return new Date();
}

function requireId(id: string | undefined) {
  if (!id) throw new Error("Missing id");
  return id;
}

function redirectTo(id: string, notice: string) {
  redirect(`/admin/claims/${encodeURIComponent(id)}?notice=${encodeURIComponent(notice)}`);
}

function isNextRedirectOrNotFound(e: unknown): boolean {
  const anyErr = e as any;
  const digest = anyErr?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND"));
}

// Apply allowlist: only these factual fields can be applied.
const APPLY_FIELDS = new Set(["displayName", "websiteUrl", "modalities", "location"]);

export async function rejectClaimRequestAction(formData: FormData) {
  const claimRequestId = requireId(formData.get("claimRequestId")?.toString());
  const note = formData.get("note")?.toString()?.trim() || "Claim/correction rejected";

  try {
    await prisma.$transaction(async (tx) => {
      const req = await tx.listingClaimRequest.findUnique({
        where: { id: claimRequestId },
        select: { id: true, listingId: true, status: true }
      });
      if (!req) throw new Error("Request not found");
      if (req.status !== "PENDING") throw new Error("Request is not PENDING");

      await tx.listingClaimRequest.update({
        where: { id: claimRequestId },
        data: { status: "REJECTED", resolvedAt: now() }
      });

      await tx.listingModerationEvent.create({
        data: {
          listingId: req.listingId,
          action: "REJECT",
          reasonCode: null,
          note: `Claim rejected: ${note}`,
          actorType: "ADMIN",
          actorName: null
        }
      });
    });

    redirectTo(claimRequestId, "rejected");
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectTo(claimRequestId, "error");
  }
}

export async function acceptClaimRequestAction(formData: FormData) {
  const claimRequestId = requireId(formData.get("claimRequestId")?.toString());
  const decisionNote = formData.get("note")?.toString()?.trim() || "Claim/correction accepted";
  const applyFields = formData
    .getAll("applyFields")
    .map((x) => x.toString())
    .filter((f) => APPLY_FIELDS.has(f));

  try {
    await prisma.$transaction(async (tx) => {
      const req = await tx.listingClaimRequest.findUnique({
        where: { id: claimRequestId },
        select: { id: true, listingId: true, status: true, fieldsRequested: true }
      });
      if (!req) throw new Error("Request not found");
      if (req.status !== "PENDING") throw new Error("Request is not PENDING");

      const payload = req.fieldsRequested as any;
      const updates: any = {};

      // Apply only selected, allowlisted fields.
      if (applyFields.includes("displayName") && typeof payload.displayName === "string" && payload.displayName.trim()) {
        updates.displayName = payload.displayName.trim();
      }
      if (applyFields.includes("websiteUrl") && typeof payload.websiteUrl === "string" && payload.websiteUrl.trim()) {
        updates.websiteUrl = payload.websiteUrl.trim();
      }

      // Modalities: payload provides modalitySlugs; map to ids and replace join table.
      if (applyFields.includes("modalities") && Array.isArray(payload.modalitySlugs)) {
        const slugs = payload.modalitySlugs.slice(0, 25);
        const mods = await tx.modality.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
        await tx.listingModality.deleteMany({ where: { listingId: req.listingId } });
        if (mods.length) {
          await tx.listingModality.createMany({
            data: mods.map((m) => ({ listingId: req.listingId, modalityId: m.id })),
            skipDuplicates: true
          });
        }
      }

      // Location: payload.location may contain canonical slugs. Bind only if we can resolve city.
      if (applyFields.includes("location") && payload.location && typeof payload.location === "object") {
        const stateSlug = typeof payload.location.stateSlug === "string" ? payload.location.stateSlug : null;
        const citySlug = typeof payload.location.citySlug === "string" ? payload.location.citySlug : null;

        if (stateSlug && citySlug) {
          const city = await tx.city.findFirst({
            where: { slug: citySlug, state: { slug: stateSlug, country: { iso2: "US" } } },
            select: { id: true }
          });
          if (city) {
            const street1 = typeof payload.location.street1 === "string" ? payload.location.street1 : null;
            const street2 = typeof payload.location.street2 === "string" ? payload.location.street2 : null;
            const postalCode = typeof payload.location.postalCode === "string" ? payload.location.postalCode : null;

            // Add as a non-primary location (admin can later set primary via existing UI).
            await tx.listingLocation.create({
              data: {
                listingId: req.listingId,
                cityId: city.id,
                street1,
                street2,
                postalCode,
                isPrimary: false
              }
            });
          }
        }
      }

      if (Object.keys(updates).length) {
        await tx.listing.update({ where: { id: req.listingId }, data: updates });
      }

      await tx.listingClaimRequest.update({
        where: { id: claimRequestId },
        data: { status: "ACCEPTED", resolvedAt: now() }
      });

      // Requirement: listing remains public even if approved; we only log review-needed.
      await tx.listingModerationEvent.create({
        data: {
          listingId: req.listingId,
          action: "SUBMIT_FOR_REVIEW",
          reasonCode: null,
          note: `Claim accepted (applied: ${applyFields.join(", ") || "none"}). ${decisionNote}`,
          actorType: "ADMIN",
          actorName: null
        }
      });
    });

    redirectTo(claimRequestId, "accepted");
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectTo(claimRequestId, "error");
  }
}


