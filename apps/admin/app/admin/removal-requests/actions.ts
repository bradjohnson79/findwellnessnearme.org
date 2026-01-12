"use server";

import { prisma } from "../../../src/lib/prisma";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

function now() {
  return new Date();
}

function requireId(id: string | undefined) {
  if (!id) throw new Error("Missing id");
  return id;
}

function redirectToQueue(notice: string) {
  redirect(`/admin/removal-requests?notice=${encodeURIComponent(notice)}`);
}

function isNextRedirectOrNotFound(e: unknown): boolean {
  const anyErr = e as any;
  const digest = anyErr?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND"));
}

async function createModerationEvent(args: {
  tx: Prisma.TransactionClient;
  listingId: string;
  action: "OPT_OUT" | "RESTORE";
  note: string;
}) {
  await args.tx.listingModerationEvent.create({
    data: {
      listingId: args.listingId,
      action: args.action,
      reasonCode: args.action === "OPT_OUT" ? "REQUESTED_REMOVAL" : null,
      note: args.note,
      actorType: "ADMIN",
      actorName: null
    }
  });
}

export async function acceptRemovalRequestAction(formData: FormData) {
  const removalRequestId = requireId(formData.get("removalRequestId")?.toString());
  const note = formData.get("note")?.toString() || "Removal request accepted";

  try {
    await prisma.$transaction(async (tx) => {
      const req = await tx.listingRemovalRequest.findUnique({
        where: { id: removalRequestId },
        select: { id: true, listingId: true, status: true }
      });
      if (!req) throw new Error("Removal request not found");
      if (req.status !== "PENDING") throw new Error("Removal request is not PENDING");

      await tx.listingRemovalRequest.update({
        where: { id: removalRequestId },
        data: { status: "ACCEPTED", resolvedAt: now() }
      });

      await tx.listing.update({
        where: { id: req.listingId },
        data: { optedOutAt: now(), moderationStatus: "OPTED_OUT" }
      });

      await createModerationEvent({
        tx,
        listingId: req.listingId,
        action: "OPT_OUT",
        note
      });
    });
    redirectToQueue("accepted");
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToQueue("error");
  }
}

export async function rejectRemovalRequestAction(formData: FormData) {
  const removalRequestId = requireId(formData.get("removalRequestId")?.toString());
  const note = formData.get("note")?.toString() || "Removal request rejected";

  try {
    await prisma.$transaction(async (tx) => {
      const req = await tx.listingRemovalRequest.findUnique({
        where: { id: removalRequestId },
        select: { id: true, listingId: true, status: true }
      });
      if (!req) throw new Error("Removal request not found");
      if (req.status !== "PENDING") throw new Error("Removal request is not PENDING");

      await tx.listingRemovalRequest.update({
        where: { id: removalRequestId },
        data: { status: "REJECTED", resolvedAt: now() }
      });

      // Listing stays as-is; we still record an auditable moderation event.
      await createModerationEvent({
        tx,
        listingId: req.listingId,
        action: "RESTORE",
        note
      });
    });
    redirectToQueue("rejected");
  } catch (e) {
    if (isNextRedirectOrNotFound(e)) throw e;
    console.error(e);
    redirectToQueue("error");
  }
}


