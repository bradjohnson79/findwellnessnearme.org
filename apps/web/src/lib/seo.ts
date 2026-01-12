import { getSiteUrl } from "./siteUrl";

export function canonicalUrl(pathname: string): string {
  const base = getSiteUrl().replace(/\/+$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}


