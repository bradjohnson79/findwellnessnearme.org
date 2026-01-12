import { braveWebSearch } from "./brave.js";

export type SearchProvider =
  | { kind: "none" }
  | { kind: "brave"; apiKey: string };

export type SearchResult = { url: string };

export async function webSearch(provider: SearchProvider, args: { query: string; count: number }): Promise<SearchResult[]> {
  if (provider.kind === "none") return [];
  if (provider.kind === "brave") {
    return braveWebSearch({ apiKey: provider.apiKey, query: args.query, count: args.count });
  }
  return [];
}


