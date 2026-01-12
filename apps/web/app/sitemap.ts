import type { MetadataRoute } from "next";
import { prisma } from "../src/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "../src/lib/publicFilters";
import { getSiteUrl } from "../src/lib/siteUrl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();

  const urls: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: `${baseUrl}/modalities`,
      changeFrequency: "weekly",
      priority: 0.6
    }
  ];

  // State pages (canonical geography; include all seeded states).
  const states = await prisma.state.findMany({
    where: { country: { iso2: "US" } },
    select: { id: true, slug: true, updatedAt: true }
  });
  for (const s of states) {
    urls.push({
      url: `${baseUrl}/state/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7
    });
  }

  // City pages: include only cities that have at least one approved listing.
  const cityCounts = await prisma.listingLocation.groupBy({
    by: ["cityId"],
    where: { deletedAt: null, listing: PUBLIC_LISTING_WHERE },
    _count: { _all: true }
  });
  const cityIds = cityCounts.map((c) => c.cityId);
  if (cityIds.length) {
    const cities = await prisma.city.findMany({
      where: { id: { in: cityIds } },
      select: { slug: true, updatedAt: true, state: { select: { slug: true } } }
    });
    for (const c of cities) {
      urls.push({
        url: `${baseUrl}/state/${c.state.slug}/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: "weekly",
        priority: 0.6
      });
    }
  }

  // Listing pages: approved only.
  const listings = await prisma.listing.findMany({
    where: PUBLIC_LISTING_WHERE,
    select: { id: true, updatedAt: true }
  });
  for (const l of listings) {
    urls.push({
      url: `${baseUrl}/listing/${l.id}`,
      lastModified: l.updatedAt,
      changeFrequency: "monthly",
      priority: 0.5
    });
  }

  // Modality pages + intersections (approved-only).
  const modalities = await prisma.modality.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, updatedAt: true }
  });

  for (const m of modalities) {
    urls.push({
      url: `${baseUrl}/modality/${m.slug}`,
      lastModified: m.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6
    });

    // Cities with approved listings for this modality, via ListingLocation groupBy.
    const modalityCityCounts = await prisma.listingLocation.groupBy({
      by: ["cityId"],
      where: {
        deletedAt: null,
        listing: { ...PUBLIC_LISTING_WHERE, modalities: { some: { modalityId: m.id } } }
      },
      _count: { _all: true }
    });

    const mCityIds = modalityCityCounts.map((c) => c.cityId);
    if (!mCityIds.length) continue;

    const mCities = await prisma.city.findMany({
      where: { id: { in: mCityIds } },
      select: { slug: true, updatedAt: true, state: { select: { slug: true } } }
    });

    const stateSlugs = new Set<string>();
    for (const c of mCities) stateSlugs.add(c.state.slug);

    // State intersection pages
    for (const s of stateSlugs) {
      urls.push({
        url: `${baseUrl}/modality/${m.slug}/us/${s}`,
        changeFrequency: "weekly",
        priority: 0.5
      });
    }

    // City intersection pages
    for (const c of mCities) {
      urls.push({
        url: `${baseUrl}/modality/${m.slug}/us/${c.state.slug}/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: "weekly",
        priority: 0.5
      });
    }
  }

  return urls;
}


