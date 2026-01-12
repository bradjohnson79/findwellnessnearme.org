"use server";

import {
  ModerationAction,
  ModerationReasonCode,
  ModerationStatus,
  Prisma
} from "@prisma/client";
import { prisma } from "../../../../src/lib/prisma";
import { redirect } from "next/navigation";
import { crawlJobIdForToday, workerQueue } from "../../../../src/lib/workerQueue";

function now() {
  return new Date();
}

function requireId(id: string | undefined) {
  if (!id) throw new Error("Missing listing id");
  return id;
}

function redirectToListing(listingId: string, args: { notice: string; detail?: string }) {
  const sp = new URLSearchParams();
  sp.set("notice", args.notice);
  if (args.detail) sp.set("detail", args.detail);
  redirect(`/admin/listings/${encodeURIComponent(listingId)}?${sp.toString()}`);
}

function isNextRedirectOrNotFound(e: unknown): boolean {
  // next/navigation's redirect() throws an internal error object with a digest like "NEXT_REDIRECT;...".
  // If we catch it, Next can break in surprising ways. Re-throw those.
  const anyErr = e as any;
  const digest = anyErr?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND"));
}

async function createModerationEvent(args: {
  tx: Prisma.TransactionClient;
  listingId: string;
  action: ModerationAction;
  reasonCode?: ModerationReasonCode | null;
  note?: string | null;
}) {
  // IMPORTANT: Every publish-affecting mutation must create exactly one ListingModerationEvent.
  await args.tx.listingModerationEvent.create({
    data: {
      listingId: args.listingId,
      action: args.action,
      reasonCode: args.reasonCode ?? null,
      note: args.note ?? null,
      actorType: "ADMIN",
      actorName: null
    }
  });
}

export async function submitForReviewAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());

  try {
    await prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listingId },
        data: { moderationStatus: "PENDING_REVIEW" }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "SUBMIT_FOR_REVIEW",
        note: "Submitted for review"
      });
    });
    redirectToListing(listingId, { notice: "submitted_for_review" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToListing(listingId, { notice: "error" });
  }
}

export async function approveAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());

  try {
    await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          moderationStatus: true,
          verificationStatus: true
        }
      });
      if (!listing) throw new Error("Listing not found");

      const latestCrawl = await tx.crawlAttempt.findFirst({
        where: { listingId },
        orderBy: [{ startedAt: "desc" }],
        select: { status: true, robotsAllowed: true, finishedAt: true }
      });

      // State gate: DRAFT must be submitted for review first.
      if (listing.moderationStatus !== "PENDING_REVIEW") {
        throw new Error(`Approval blocked: listing is not PENDING_REVIEW (is ${listing.moderationStatus})`);
      }

      // Policy gate (MVP): approval requires a successful latest crawl and VERIFIED status.
      if (!latestCrawl || latestCrawl.status !== "SUCCESS") {
        throw new Error("Approval blocked: latest crawl is not SUCCESS");
      }
      if (latestCrawl.robotsAllowed === false) {
        throw new Error("Approval blocked: robotsAllowed=false on latest crawl");
      }
      if (listing.verificationStatus !== "VERIFIED") {
        throw new Error("Approval blocked: listing.verificationStatus is not VERIFIED");
      }

      await tx.listing.update({
        where: { id: listingId },
        data: { moderationStatus: "APPROVED" }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "APPROVE",
        note: "Approved"
      });
    });
    redirectToListing(listingId, { notice: "approved" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    const msg = (e as any)?.message ? String((e as any).message) : "";
    console.error(e);
    if (msg.startsWith("Approval blocked:")) {
      redirectToListing(listingId, { notice: "approval_blocked", detail: msg });
    }
    redirectToListing(listingId, { notice: "error" });
  }
}

const REVERIFY_STALE_DAYS = 14;
function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

export async function reverifyAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());

  if (!process.env.REDIS_URL) {
    redirectToListing(listingId, { notice: "error", detail: "REDIS_URL is required to enqueue re-verification jobs" });
  }

  try {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { verificationStatus: true, lastCrawledAt: true, deletedAt: true, optedOutAt: true }
    });
    if (!listing) throw new Error("Listing not found");
    if (listing.deletedAt) throw new Error("Re-verify blocked: listing is deleted");
    if (listing.optedOutAt) throw new Error("Re-verify blocked: listing is opted out");

    const cutoff = new Date(Date.now() - days(REVERIFY_STALE_DAYS));
    const stale = !listing.lastCrawledAt || listing.lastCrawledAt < cutoff;
    const failed = listing.verificationStatus === "FAILED";
    if (!failed && !stale) {
      redirectToListing(listingId, { notice: "reverify_skipped", detail: "Already verified / recently crawled" });
    }

    const queue = workerQueue();
    await queue.add(
      "CRAWL_WEBSITE",
      { listingId },
      {
        jobId: crawlJobIdForToday(listingId),
        removeOnComplete: 2000,
        removeOnFail: 2000
      }
    );
    await queue.close();

    await prisma.listingModerationEvent.create({
      data: {
        listingId,
        action: "REVERIFY_REQUESTED",
        reasonCode: null,
        note: "Re-verify requested",
        actorType: "ADMIN",
        actorName: null
      }
    });

    redirectToListing(listingId, { notice: "reverify_queued" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    const msg = (e as any)?.message ? String((e as any).message) : "Action failed";
    console.error(e);
    redirectToListing(listingId, { notice: "error", detail: msg });
  }
}

export async function rejectAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());
  const reasonCode = (formData.get("reasonCode")?.toString() || null) as
    | ModerationReasonCode
    | null;
  const note = formData.get("note")?.toString() || null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listingId },
        data: { moderationStatus: "REJECTED" }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "REJECT",
        reasonCode,
        note
      });
    });
    redirectToListing(listingId, { notice: "rejected" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToListing(listingId, { notice: "error" });
  }
}

export async function unpublishAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());
  const note = formData.get("note")?.toString() || "Unpublished";

  try {
    await prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listingId },
        data: { moderationStatus: "UNPUBLISHED" }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "UNPUBLISH",
        note
      });
    });
    redirectToListing(listingId, { notice: "unpublished" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToListing(listingId, { notice: "error" });
  }
}

export async function softDeleteAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());

  try {
    await prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listingId },
        data: { deletedAt: now(), moderationStatus: "UNPUBLISHED" }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "UNPUBLISH",
        note: "Soft-deleted"
      });
    });
    redirectToListing(listingId, { notice: "soft_deleted" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToListing(listingId, { notice: "error" });
  }
}

export async function optOutAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());

  try {
    await prisma.$transaction(async (tx) => {
      const pending = await tx.listingRemovalRequest.findFirst({
        where: { listingId, status: "PENDING" },
        orderBy: [{ createdAt: "asc" }],
        select: { id: true }
      });
      if (!pending) {
        // Requirement: Opt-out only if a removal request exists.
        throw new Error("Opt-out blocked: no PENDING removal request exists for this listing");
      }

      await tx.listingRemovalRequest.update({
        where: { id: pending.id },
        data: { status: "ACCEPTED", resolvedAt: now() }
      });

      await tx.listing.update({
        where: { id: listingId },
        data: { optedOutAt: now(), moderationStatus: "OPTED_OUT" }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "OPT_OUT",
        reasonCode: "REQUESTED_REMOVAL",
        note: "Opted out (removal request accepted)"
      });
    });
    redirectToListing(listingId, { notice: "opted_out" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToListing(listingId, { notice: "error" });
  }
}

export async function editPublicFieldsAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());
  const displayName = formData.get("displayName")?.toString() ?? "";
  const summaryRaw = formData.get("summary")?.toString();
  const summary = summaryRaw?.trim() ? summaryRaw.trim() : null;

  try {
    await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: { moderationStatus: true }
      });
      if (!listing) throw new Error("Listing not found");

      const nextStatus: ModerationStatus =
        listing.moderationStatus === "APPROVED" ? "PENDING_REVIEW" : listing.moderationStatus;

      await tx.listing.update({
        where: { id: listingId },
        data: {
          displayName,
          summary,
          moderationStatus: nextStatus
        }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "SUBMIT_FOR_REVIEW",
        note: "Edited public fields (displayName/summary)"
      });
    });
    redirectToListing(listingId, { notice: "saved" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToListing(listingId, { notice: "error" });
  }
}

export async function setModalitiesAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());
  const modalityIds = formData.getAll("modalityIds").map((x) => x.toString()).filter(Boolean);

  try {
    await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: { moderationStatus: true }
      });
      if (!listing) throw new Error("Listing not found");

      const nextStatus: ModerationStatus =
        listing.moderationStatus === "APPROVED" ? "PENDING_REVIEW" : listing.moderationStatus;

      await tx.listingModality.deleteMany({ where: { listingId } });
      if (modalityIds.length) {
        await tx.listingModality.createMany({
          data: modalityIds.map((modalityId) => ({ listingId, modalityId })),
          skipDuplicates: true
        });
      }

      await tx.listing.update({
        where: { id: listingId },
        data: { moderationStatus: nextStatus }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "SUBMIT_FOR_REVIEW",
        note: "Edited modalities"
      });
    });
    redirectToListing(listingId, { notice: "modalities_saved" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToListing(listingId, { notice: "error" });
  }
}

export async function addLocationAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());
  const cityId = requireId(formData.get("cityId")?.toString());
  const street1 = formData.get("street1")?.toString() || null;
  const street2 = formData.get("street2")?.toString() || null;
  const postalCode = formData.get("postalCode")?.toString() || null;
  const isPrimary = formData.get("isPrimary")?.toString() === "on";

  try {
    await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: { moderationStatus: true }
      });
      if (!listing) throw new Error("Listing not found");

      const nextStatus: ModerationStatus =
        listing.moderationStatus === "APPROVED" ? "PENDING_REVIEW" : listing.moderationStatus;

      if (isPrimary) {
        await tx.listingLocation.updateMany({
          where: { listingId, deletedAt: null },
          data: { isPrimary: false }
        });
      }

      await tx.listingLocation.create({
        data: {
          listingId,
          cityId,
          street1,
          street2,
          postalCode,
          isPrimary
        }
      });

      await tx.listing.update({
        where: { id: listingId },
        data: { moderationStatus: nextStatus }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "SUBMIT_FOR_REVIEW",
        note: "Edited locations (added location)"
      });
    });
    redirectToListing(listingId, { notice: "location_added" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToListing(listingId, { notice: "error" });
  }
}

export async function setPrimaryLocationAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());
  const locationId = requireId(formData.get("locationId")?.toString());

  try {
    await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: { moderationStatus: true }
      });
      if (!listing) throw new Error("Listing not found");

      const nextStatus: ModerationStatus =
        listing.moderationStatus === "APPROVED" ? "PENDING_REVIEW" : listing.moderationStatus;

      await tx.listingLocation.updateMany({
        where: { listingId, deletedAt: null },
        data: { isPrimary: false }
      });
      await tx.listingLocation.update({
        where: { id: locationId },
        data: { isPrimary: true }
      });

      await tx.listing.update({
        where: { id: listingId },
        data: { moderationStatus: nextStatus }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "SUBMIT_FOR_REVIEW",
        note: "Edited locations (set primary)"
      });
    });
    redirectToListing(listingId, { notice: "primary_location_set" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToListing(listingId, { notice: "error" });
  }
}

export async function removeLocationAction(formData: FormData) {
  const listingId = requireId(formData.get("listingId")?.toString());
  const locationId = requireId(formData.get("locationId")?.toString());

  try {
    await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: { moderationStatus: true }
      });
      if (!listing) throw new Error("Listing not found");

      const nextStatus: ModerationStatus =
        listing.moderationStatus === "APPROVED" ? "PENDING_REVIEW" : listing.moderationStatus;

      await tx.listingLocation.update({
        where: { id: locationId },
        data: { deletedAt: now(), isPrimary: false }
      });

      await tx.listing.update({
        where: { id: listingId },
        data: { moderationStatus: nextStatus }
      });

      await createModerationEvent({
        tx,
        listingId,
        action: "SUBMIT_FOR_REVIEW",
        note: "Edited locations (removed location)"
      });
    });
    redirectToListing(listingId, { notice: "location_removed" });
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToListing(listingId, { notice: "error" });
  }
}


