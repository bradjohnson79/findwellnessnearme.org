import { prisma } from "../lib/prisma.js";
import type { AiEvaluateJobData } from "../types.js";
import { aiReviewConfig } from "../lib/ai/config.js";
import { runAiReview } from "../lib/ai/review.js";

function isEligibleForAutoApproval(args: {
  listing: {
    moderationStatus: string;
    verificationStatus: string;
    needsAttention: boolean;
    optedOutAt: Date | null;
    deletedAt: Date | null;
  };
  attempt: { status: string; robotsAllowed: boolean | null };
}) {
  return (
    args.listing.moderationStatus === "PENDING_REVIEW" &&
    args.listing.verificationStatus === "VERIFIED" &&
    args.listing.needsAttention === false &&
    !args.listing.optedOutAt &&
    !args.listing.deletedAt &&
    args.attempt.status === "SUCCESS" &&
    args.attempt.robotsAllowed !== false
  );
}

export async function runAiEvaluateListingJob(data: AiEvaluateJobData): Promise<{
  verdict: string;
  confidence: number;
  autoApproved: boolean;
  needsHuman: boolean;
}> {
  const cfg = aiReviewConfig();

  const [listing, attempt] = await Promise.all([
    prisma.listing.findUnique({
      where: { id: data.listingId },
      select: {
        id: true,
        displayName: true,
        websiteUrl: true,
        websiteDomain: true,
        summary: true,
        moderationStatus: true,
        verificationStatus: true,
        needsAttention: true,
        optedOutAt: true,
        deletedAt: true,
        modalities: { include: { modality: true } },
        removalRequests: { where: { status: "PENDING" }, select: { id: true }, take: 1 }
      }
    }),
    prisma.crawlAttempt.findUnique({
      where: { id: data.crawlAttemptId },
      select: {
        id: true,
        listingId: true,
        status: true,
        robotsAllowed: true,
        extractedData: true
      }
    })
  ]);

  if (!listing) throw new Error("Listing not found");
  if (!attempt) throw new Error("CrawlAttempt not found");
  if (attempt.listingId !== listing.id) throw new Error("CrawlAttempt does not belong to listing");

  const input = {
    listing: {
      id: listing.id,
      displayName: listing.displayName,
      websiteUrl: listing.websiteUrl,
      websiteDomain: listing.websiteDomain,
      summary: listing.summary ?? null,
      modalities: listing.modalities.map((lm) => ({ slug: lm.modality.slug, displayName: lm.modality.displayName }))
    },
    crawl: {
      id: attempt.id,
      status: attempt.status,
      robotsAllowed: attempt.robotsAllowed ?? null,
      extractedData: attempt.extractedData ?? {}
    }
  };

  const ai = await runAiReview(input);

  // Persist the AI review (always).
  await prisma.aIReview.create({
    data: {
      listingId: listing.id,
      crawlAttemptId: attempt.id,
      verdict: ai.verdict,
      confidence: ai.confidence,
      reasons: ai.reasons,
      flags: ai.flags,
      modelVersion: ai.modelVersion,
      rawResponse: ai.rawResponse ?? null
    }
  });

  const passesHardChecks = isEligibleForAutoApproval({
    listing: {
      moderationStatus: listing.moderationStatus,
      verificationStatus: listing.verificationStatus,
      needsAttention: listing.needsAttention,
      optedOutAt: listing.optedOutAt,
      deletedAt: listing.deletedAt
    },
    attempt: { status: attempt.status, robotsAllowed: attempt.robotsAllowed ?? null }
  });

  // Safety rule: any pending removal request bypasses AI auto-approval.
  const hasPendingRemovalRequest = listing.removalRequests.length > 0;

  // Determine routing:
  const wouldAutoApprove =
    cfg.enabled &&
    cfg.autoApprovalEnabled &&
    passesHardChecks &&
    !hasPendingRemovalRequest &&
    ai.verdict === "PASS" &&
    ai.confidence >= cfg.minAutoApproveConfidence &&
    ai.flags.length === 0;

  // If auto-approve is enabled, anything that is not auto-approved but was evaluated is routed to human.
  const needsHuman =
    ai.verdict === "FAIL" ||
    (cfg.autoApprovalEnabled &&
      (hasPendingRemovalRequest || ai.confidence < cfg.minAutoApproveConfidence || ai.flags.length > 0));

  if (wouldAutoApprove) {
    await prisma.$transaction(async (tx) => {
      // Re-check state in DB to prevent races.
      const res = await tx.listing.updateMany({
        where: {
          id: listing.id,
          moderationStatus: "PENDING_REVIEW",
          verificationStatus: "VERIFIED",
          needsAttention: false,
          optedOutAt: null,
          deletedAt: null
        },
        data: {
          moderationStatus: "APPROVED",
          approvalSource: "AI",
          approvalConfidence: ai.confidence,
          aiNeedsHumanReview: false
        }
      });
      if (res.count !== 1) return;

      await tx.listingModerationEvent.create({
        data: {
          listingId: listing.id,
          action: "AI_AUTO_APPROVED",
          reasonCode: null,
          note: `AI_AUTO_APPROVED (confidence=${ai.confidence.toFixed(2)}, model=${ai.modelVersion})`,
          actorType: "SYSTEM",
          actorName: "AI"
        }
      });
    });

    return { verdict: ai.verdict, confidence: ai.confidence, autoApproved: true, needsHuman: false };
  }

  // Mark for human attention when appropriate (but never changes moderation status).
  if (needsHuman) {
    await prisma.listing.update({
      where: { id: listing.id },
      data: { aiNeedsHumanReview: true }
    });
  } else {
    // Clear any prior flag on PASS when auto-approve is disabled.
    await prisma.listing.update({
      where: { id: listing.id },
      data: { aiNeedsHumanReview: false }
    });
  }

  return { verdict: ai.verdict, confidence: ai.confidence, autoApproved: false, needsHuman };
}


