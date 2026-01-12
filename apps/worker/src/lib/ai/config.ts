import { numberEnv, optionalEnv } from "../env.js";

export type AiProviderKind = "none" | "openai";

export type AiReviewConfig = {
  provider: AiProviderKind;
  openaiApiKey?: string;
  model: string;

  // Control-plane switches
  enabled: boolean;
  autoApprovalEnabled: boolean;
  minAutoApproveConfidence: number;

  // Safety caps
  maxInputChars: number;
};

export function aiReviewConfig(): AiReviewConfig {
  const providerRaw = (optionalEnv("AI_REVIEW_PROVIDER") ?? "none").toLowerCase();
  const provider: AiProviderKind = providerRaw === "openai" ? "openai" : "none";

  const enabled = (optionalEnv("AI_REVIEW_ENABLED") ?? "0") === "1";
  // Phase 10.2: feature flag rename. Support both for compatibility.
  const autoApprovalEnabled =
    (optionalEnv("AI_AUTO_APPROVAL_ENABLED") ?? optionalEnv("AI_AUTO_APPROVE_ENABLED") ?? "0") === "1";

  return {
    provider,
    openaiApiKey: optionalEnv("OPENAI_API_KEY"),
    model: optionalEnv("AI_REVIEW_MODEL") ?? "gpt-4.1-mini",
    enabled,
    autoApprovalEnabled,
    minAutoApproveConfidence: numberEnv("AI_AUTO_APPROVE_MIN_CONFIDENCE", 0.9),
    maxInputChars: numberEnv("AI_REVIEW_MAX_INPUT_CHARS", 20_000)
  };
}


