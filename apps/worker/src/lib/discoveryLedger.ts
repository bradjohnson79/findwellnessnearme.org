import { randomUUID } from "node:crypto";
import type {
  DiscoveryDecision,
  DiscoveryJobType,
  DiscoveryProvider,
  ProviderErrorType,
  TaxonomyFinalDecision
} from "@prisma/client";
import { prisma } from "./prisma.js";

export type DiscoveryAttemptInput = {
  jobId: string;
  jobType: DiscoveryJobType;
  provider: DiscoveryProvider;

  rawName?: string | null;
  rawAddress?: string | null;
  rawCity?: string | null;
  rawState?: string | null;
  rawCountry?: string | null;
  rawCategory?: string | null;

  normalizedKey: string;
  confidenceScore?: number | null;

  decision: DiscoveryDecision;
  decisionReason: string;

  taxonomyRuleId?: string | null;
  capRuleId?: string | null;

  providerErrorCode?: string | null;
  providerErrorRetryable?: boolean | null;
  providerErrorType?: ProviderErrorType | null;
  payloadExcerpt?: string | null;

  taxonomy: {
    inputCategory?: string | null;
    matchedCategories: string[];
    excludedCategories: string[];
    finalDecision: TaxonomyFinalDecision;
    taxonomyRuleId?: string | null;
  };
};

export async function appendDiscoveryAttempt(input: DiscoveryAttemptInput): Promise<string> {
  if (!input.decisionReason || !input.decisionReason.trim()) {
    throw new Error("DiscoveryAttempt.decisionReason must be non-empty");
  }

  const attemptId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.discoveryAttempt.create({
      data: {
        attemptId,
        jobId: input.jobId,
        jobType: input.jobType,
        provider: input.provider,
        rawName: input.rawName ?? null,
        rawAddress: input.rawAddress ?? null,
        rawCity: input.rawCity ?? null,
        rawState: input.rawState ?? null,
        rawCountry: input.rawCountry ?? null,
        rawCategory: input.rawCategory ?? null,
        normalizedKey: input.normalizedKey,
        confidenceScore: input.confidenceScore ?? null,
        decision: input.decision,
        decisionReason: input.decisionReason,
        taxonomyRuleId: input.taxonomyRuleId ?? null,
        capRuleId: input.capRuleId ?? null,
        providerErrorCode: input.providerErrorCode ?? null,
        providerErrorRetryable: input.providerErrorRetryable ?? null,
        providerErrorType: input.providerErrorType ?? null,
        payloadExcerpt: input.payloadExcerpt ?? null
      }
    });

    await tx.taxonomyEvaluation.create({
      data: {
        attemptId,
        inputCategory: input.taxonomy.inputCategory ?? null,
        matchedCategories: input.taxonomy.matchedCategories,
        excludedCategories: input.taxonomy.excludedCategories,
        finalDecision: input.taxonomy.finalDecision,
        taxonomyRuleId: input.taxonomy.taxonomyRuleId ?? null
      }
    });
  });

  return attemptId;
}


