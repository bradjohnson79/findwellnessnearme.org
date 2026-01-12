export type WebSearchResult = {
  url: string;
};

export class BraveSearchError extends Error {
  status: number;
  retryable: boolean;
  errorType: "timeout" | "quota" | "malformed" | "empty" | "parse" | "other";
  payloadExcerpt?: string;

  constructor(args: {
    message: string;
    status: number;
    retryable: boolean;
    errorType: BraveSearchError["errorType"];
    payloadExcerpt?: string;
  }) {
    super(args.message);
    this.name = "BraveSearchError";
    this.status = args.status;
    this.retryable = args.retryable;
    this.errorType = args.errorType;
    this.payloadExcerpt = args.payloadExcerpt;
  }
}

export async function braveWebSearch(args: { apiKey: string; query: string; count: number }): Promise<WebSearchResult[]> {
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", args.query);
  u.searchParams.set("count", String(Math.max(1, Math.min(args.count, 20))));

  let res: Response;
  try {
    res = await fetch(u.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": args.apiKey
      }
    });
  } catch (e: any) {
    throw new BraveSearchError({
      message: `Brave search network error: ${String(e?.message ?? e)}`,
      status: 0,
      retryable: true,
      errorType: "timeout"
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const excerpt = text ? text.slice(0, 500) : undefined;
    const retryable = res.status === 429 || res.status >= 500;
    const errorType = res.status === 429 ? "quota" : "other";
    throw new BraveSearchError({
      message: `Brave search failed: ${res.status}`,
      status: res.status,
      retryable,
      errorType,
      payloadExcerpt: excerpt
    });
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new BraveSearchError({
      message: "Brave search returned non-JSON response",
      status: res.status,
      retryable: false,
      errorType: "parse"
    });
  }
  const web = json?.web?.results;
  if (!Array.isArray(web)) return [];

  const out: WebSearchResult[] = [];
  for (const r of web) {
    const url = typeof r?.url === "string" ? r.url : null;
    if (url) out.push({ url });
  }
  return out;
}


