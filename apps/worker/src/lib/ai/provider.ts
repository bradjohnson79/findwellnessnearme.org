export type AiReviewVerdict = "PASS" | "FAIL";

export type AiReviewResult = {
  verdict: AiReviewVerdict;
  confidence: number; // 0..1
  reasons: string[];
  flags: string[];
  modelVersion: string;
  rawResponse?: string;
};

export type AiReviewInput = {
  listing: {
    id: string;
    displayName: string;
    websiteUrl: string;
    websiteDomain: string;
    summary: string | null;
    modalities: { slug: string; displayName: string }[];
  };
  crawl: {
    id: string;
    status: string;
    robotsAllowed: boolean | null;
    extractedData: any;
  };
};

export type AiProvider =
  | { kind: "none" }
  | { kind: "openai"; apiKey: string; model: string };

export function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function safeStringArray(x: any): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((v) => String(v)).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}

export function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}


