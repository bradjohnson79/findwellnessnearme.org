import type { MetadataRoute } from "next";
import { getSiteUrl } from "../src/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  // Phase 5A: allow crawling of public pages.
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${getSiteUrl()}/sitemap.xml`
  };
}


