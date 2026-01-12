import { aiReviewConfig } from "./config.js";
import type { AiReviewInput, AiReviewResult, AiProvider } from "./provider.js";
import { openaiReview } from "./openai.js";

export function providerFromEnv(): AiProvider {
  const cfg = aiReviewConfig();
  if (!cfg.enabled) return { kind: "none" };
  if (cfg.provider === "openai" && cfg.openaiApiKey) {
    return { kind: "openai", apiKey: cfg.openaiApiKey, model: cfg.model };
  }
  return { kind: "none" };
}

export async function runAiReview(input: AiReviewInput): Promise<AiReviewResult> {
  const cfg = aiReviewConfig();
  const provider = providerFromEnv();

  if (provider.kind === "none") {
    return {
      verdict: "FAIL",
      confidence: 0,
      reasons: ["AI review disabled (AI_REVIEW_ENABLED=0 or missing provider key)."],
      flags: [],
      modelVersion: "none"
    };
  }

  if (provider.kind === "openai") {
    // Enforce a hard cap on input size to control costs.
    // (We rely on OpenAI prompt construction to be small; this is just a guard rail.)
    const jsonSize = JSON.stringify(input).length;
    if (jsonSize > cfg.maxInputChars) {
      return {
        verdict: "FAIL",
        confidence: 0,
        reasons: [`AI input too large (${jsonSize} chars).`],
        flags: ["input_too_large"],
        modelVersion: provider.model
      };
    }

    return openaiReview({ apiKey: provider.apiKey, model: provider.model, input });
  }

  return {
    verdict: "FAIL",
    confidence: 0,
    reasons: ["AI provider not supported."],
    flags: ["provider_unsupported"],
    modelVersion: "unknown"
  };
}


