export const DISCOVERY_BLOCKED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "yelp.com",
  "healthgrades.com",
  "psychologytoday.com",
  "webmd.com",
  "mapquest.com",
  "linkedin.com",
  "indeed.com",
  "yellowpages.com",
  "betterhelp.com",
  "zocdoc.com",
  "opencare.com",
  "angieslist.com"
] as const;

export function isBlockedHostname(hostnameOrRegistrable: string | null | undefined): boolean {
  if (!hostnameOrRegistrable) return false;
  const h = hostnameOrRegistrable.toLowerCase();
  for (const b of DISCOVERY_BLOCKED_DOMAINS) {
    if (h === b) return true;
    if (h.endsWith(`.${b}`)) return true;
  }
  return false;
}


