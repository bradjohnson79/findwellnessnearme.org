import { clamp01, safeStringArray, truncate, type AiReviewInput, type AiReviewResult } from "./provider.js";

type OpenAIChatResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
};

function buildPrompt(input: AiReviewInput) {
  // IMPORTANT: deterministic, policy-enforcing evaluator. No web browsing, no external lookups.
  // We only evaluate provided extracted metadata and listing fields.
  const pages: any[] = Array.isArray(input.crawl?.extractedData?.pages) ? input.crawl.extractedData.pages : [];
  const pageSnippets = pages.slice(0, 4).map((p) => ({
    path: p?.path ?? null,
    finalUrl: p?.finalUrl ?? null,
    httpStatus: p?.httpStatus ?? null,
    title: p?.title ?? null,
    h1: p?.h1 ?? null,
    h2: Array.isArray(p?.h2) ? p.h2.slice(0, 8) : [],
    metaDescription: p?.metaDescription ?? null,
    hasEmail: p?.hasEmail ?? null,
    hasPhone: p?.hasPhone ?? null
  }));

  const payload = {
    listing: {
      displayName: input.listing.displayName,
      websiteDomain: input.listing.websiteDomain,
      websiteUrl: input.listing.websiteUrl,
      summary: input.listing.summary,
      modalities: input.listing.modalities.map((m) => ({ slug: m.slug, displayName: m.displayName }))
    },
    crawl: {
      status: input.crawl.status,
      robotsAllowed: input.crawl.robotsAllowed,
      pages: pageSnippets
    }
  };

  return [
    {
      role: "system",
      content:
        "You are an auditor for a reference-grade wellness directory. You enforce strict neutrality and policy. " +
        "You NEVER browse the web and you ONLY use the provided JSON payload."
    },
    {
      role: "system",
      content:
        "Return ONLY valid JSON with this schema: " +
        "{ verdict: 'PASS'|'FAIL', confidence: number(0..1), reasons: string[], flags: string[] }. " +
        "No markdown. No extra keys."
    },
    {
      role: "user",
      content:
        "Evaluate whether this listing meets policy for auto-approval.\n\n" +
        "Rules:\n" +
        "- PASS only if content is neutral, factual, non-promotional.\n" +
        "- FAIL if you detect testimonials/reviews, medical claims, guarantees, pricing hype, or promotional language.\n" +
        "- FAIL if modalities/services appear mismatched or unclear from provided content.\n\n" +
        "If FAIL, include actionable reasons.\n\n" +
        "JSON payload:\n" +
        JSON.stringify(payload)
    }
  ] as const;
}

function parseJsonFromContent(content: string): any {
  // Best effort: try direct parse; if model wraps with text, extract first {...} block.
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      return JSON.parse(slice);
    }
    throw new Error("AI output was not JSON");
  }
}

export async function openaiReview(args: {
  apiKey: string;
  model: string;
  input: AiReviewInput;
}): Promise<AiReviewResult> {
  const messages = buildPrompt(args.input);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0,
      messages
    })
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI API error ${res.status}: ${truncate(text, 500)}`);
  }

  const json = JSON.parse(text) as OpenAIChatResponse;
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = parseJsonFromContent(content);

  const verdict = parsed?.verdict === "PASS" ? "PASS" : "FAIL";
  const confidence = clamp01(Number(parsed?.confidence ?? 0));
  const reasons = safeStringArray(parsed?.reasons);
  const flags = safeStringArray(parsed?.flags);

  return {
    verdict,
    confidence,
    reasons,
    flags,
    modelVersion: args.model,
    rawResponse: truncate(content, 4000)
  };
}


