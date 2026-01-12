import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "../../../../../src/lib/prisma";
import { PUBLIC_LISTING_WHERE } from "../../../../../src/lib/publicFilters";
import { Pagination } from "../../../../../src/components/Pagination";
import { firstParam, intParam } from "../../../../../src/lib/searchParams";
import { JsonLd } from "../../../../../src/components/JsonLd";
import { canonicalUrl } from "../../../../../src/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({
  params
}: {
  params: { modalitySlug: string; stateSlug: string };
}): Promise<Metadata> {
  const [modality, state] = await Promise.all([
    prisma.modality.findUnique({ where: { slug: params.modalitySlug }, select: { displayName: true, slug: true, isActive: true } }),
    prisma.state.findFirst({ where: { slug: params.stateSlug, country: { iso2: "US" } }, select: { name: true, slug: true, uspsCode: true } })
  ]);
  if (!modality || !modality.isActive || !state) return { title: "Not found" };
  const title = `${modality.displayName} practitioners in ${state.name}`;
  return {
    title,
    description: `Browse approved ${modality.displayName} listings in ${state.name}.`,
    alternates: { canonical: `/modality/${modality.slug}/us/${state.slug}` },
    robots: { index: true, follow: true }
  };
}

export default async function ModalityStatePage({
  params,
  searchParams
}: {
  params: { modalitySlug: string; stateSlug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams ?? {};
  const page = intParam(sp.page, 1);
  const pageSize = 20;
  const sortParam = firstParam(sp.sort);
  const sort = sortParam === "recent" ? "recent" : "alpha";

  const modality = await prisma.modality.findUnique({
    where: { slug: params.modalitySlug },
    select: { id: true, displayName: true, slug: true, isActive: true }
  });
  if (!modality || !modality.isActive) return notFound();

  const state = await prisma.state.findFirst({
    where: { slug: params.stateSlug, country: { iso2: "US" } },
    select: { id: true, name: true, slug: true, uspsCode: true }
  });
  if (!state) return notFound();

  const where = {
    ...PUBLIC_LISTING_WHERE,
    modalities: { some: { modalityId: modality.id } },
    locations: { some: { deletedAt: null, city: { stateId: state.id } } }
  };

  const orderBy =
    sort === "recent"
      ? [{ lastVerifiedAt: { sort: "desc" as const, nulls: "last" as const } }]
      : [{ displayName: "asc" as const }];

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        modalities: { include: { modality: true } },
        locations: {
          where: { deletedAt: null },
          include: { city: { include: { state: true } } },
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
          take: 1
        }
      }
    })
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${modality.displayName} practitioners in ${state.name}`,
    url: canonicalUrl(`/modality/${modality.slug}/us/${state.slug}`),
    isPartOf: { "@type": "WebSite", name: "findwellnessnearme.org", url: canonicalUrl("/") }
  };

  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <JsonLd data={jsonLd} />
      <h1 className="fnm-title">
        {modality.displayName} in {state.name}
      </h1>
      <div className="fnm-text-sm fnm-muted">
        Approved listings only. <a href={`/modality/${modality.slug}`}>Back to {modality.displayName}</a>
      </div>

      <div className="fnm-text-sm fnm-muted">
        Sort:{" "}
        <a href={`?sort=alpha`}>alphabetical</a> ·{" "}
        <a href={`?sort=recent`}>recently verified</a>
      </div>

      <div className="fnm-text-sm fnm-muted">
        {total} result{total === 1 ? "" : "s"}
      </div>

      {listings.length ? (
        <ol className="fnm-list fnm-stack fnm-gap-md">
          {listings.map((l) => {
            const modalityNames = l.modalities.map((lm) => lm.modality.displayName).sort();
            const loc = l.locations[0] ?? null;
            const locText = loc ? `${loc.city.name}, ${loc.city.state.uspsCode}` : `${state.name}`;
            return (
              <li key={l.id}>
                <div className="fnm-semibold">
                  <a href={`/listing/${l.id}`}>{l.displayName}</a>
                </div>
                <div className="fnm-text-sm fnm-muted">{locText}</div>
                <div className="fnm-text-sm fnm-muted">{modalityNames.join(", ")}</div>
                {l.summary ? <div className="fnm-mt-xs">{l.summary}</div> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div>No approved listings yet.</div>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        makeHref={(p) => `?sort=${sort}&page=${p}`}
      />
    </div>
  );
}


