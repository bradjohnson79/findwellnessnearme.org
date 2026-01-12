import { numberEnv, optionalEnv } from "./env.js";

function parseList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type DiscoveryConfig = {
  activeStateSlugs: string[];
  modalitySlugs: string[];
  cityBatchSize: number;

  // Throughput caps (hard stops)
  maxNewListingsPerDay: number;
  maxDiscoveryBatchesPerRun: number;
  maxDomainsPerCity: number;
  maxResultsPerQuery: number;

  // Provider
  searchProvider: "brave" | "none";
  braveApiKey?: string;
};

export function discoveryConfig(): DiscoveryConfig {
  const activeStateSlugs = parseList(optionalEnv("DISCOVERY_ACTIVE_STATE_SLUGS")).map((s) => s.toLowerCase());
  const modalitySlugs = parseList(optionalEnv("DISCOVERY_MODALITY_SLUGS")).map((s) => s.toLowerCase());

  const searchProviderRaw = (optionalEnv("DISCOVERY_SEARCH_PROVIDER") ?? "none").toLowerCase();
  const searchProvider = searchProviderRaw === "brave" ? "brave" : "none";

  return {
    activeStateSlugs,
    modalitySlugs,
    cityBatchSize: numberEnv("DISCOVERY_CITY_BATCH_SIZE", 15),
    maxNewListingsPerDay: numberEnv("MAX_NEW_LISTINGS_PER_DAY", 500),
    maxDiscoveryBatchesPerRun: numberEnv("MAX_DISCOVERY_JOBS_PER_HOUR", 25),
    maxDomainsPerCity: numberEnv("MAX_DOMAINS_PER_CITY", 20),
    maxResultsPerQuery: numberEnv("DISCOVERY_MAX_RESULTS_PER_QUERY", 10),
    searchProvider,
    braveApiKey: optionalEnv("BRAVE_SEARCH_API_KEY")
  };
}


