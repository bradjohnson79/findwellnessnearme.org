export function normalizeWebsiteUrl(input: string): string {
  const u = new URL(input);
  // Force https if no explicit scheme was given upstream; otherwise respect input.
  if (!u.protocol) u.protocol = "https:";
  // Remove hash; keep query (some sites use it, but for Tier-1 verification we typically won't).
  u.hash = "";
  // Normalize trailing slash
  if (!u.pathname || u.pathname === "") u.pathname = "/";
  return u.toString();
}

export function getRegistrableHost(url: string): string {
  const u = new URL(url);
  // V1: store host as-is (e.g. www.example.com). Future: could normalize www.
  return u.host.toLowerCase();
}

export function sameHost(a: string, b: string): boolean {
  return new URL(a).host.toLowerCase() === new URL(b).host.toLowerCase();
}

export function buildSameHostUrl(base: string, path: string): string {
  const u = new URL(base);
  u.pathname = path.startsWith("/") ? path : `/${path}`;
  u.search = "";
  u.hash = "";
  return u.toString();
}


