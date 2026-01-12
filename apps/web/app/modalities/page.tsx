import type { Metadata } from "next";
import { prisma } from "../../src/lib/prisma";
import { JsonLd } from "../../src/components/JsonLd";
import { canonicalUrl } from "../../src/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Modalities",
  description: "Browse the controlled modality taxonomy.",
  alternates: { canonical: "/modalities" }
};

export default async function ModalitiesPage() {
  const modalities = await prisma.modality.findMany({
    where: { isActive: true },
    orderBy: [{ displayName: "asc" }]
  });

  const byParent = new Map<string, typeof modalities>();
  const topLevel: typeof modalities = [];
  const byId = new Map(modalities.map((m) => [m.id, m]));

  for (const m of modalities) {
    if (!m.parentId) {
      topLevel.push(m);
      continue;
    }
    const parent = byId.get(m.parentId);
    const parentKey = parent ? parent.slug : m.parentId;
    const arr = byParent.get(parentKey) ?? [];
    arr.push(m);
    byParent.set(parentKey, arr);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Modalities",
    url: canonicalUrl("/modalities"),
    isPartOf: { "@type": "WebSite", name: "findwellnessnearme.org", url: canonicalUrl("/") }
  };

  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <JsonLd data={jsonLd} />
      <h1 className="fnm-title">Modalities</h1>
      <div className="fnm-text-sm fnm-muted">Controlled taxonomy. No free-text categories.</div>

      {topLevel.length ? (
        <section className="fnm-section">
          <h2 className="fnm-title">Browse</h2>
          <ul className="fnm-list fnm-mt-sm">
            {topLevel
              .sort((a, b) => a.displayName.localeCompare(b.displayName))
              .map((m) => (
                <li key={m.id}>
                  <a href={`/modality/${m.slug}`}>{m.displayName}</a>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {Array.from(byParent.entries()).length ? (
        <section className="fnm-section">
          <h2 className="fnm-title">Grouped</h2>
          {Array.from(byParent.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([parentKey, children]) => {
              const sorted = children.sort((a, b) => a.displayName.localeCompare(b.displayName));
              return (
                <div key={parentKey} className="fnm-stack fnm-gap-xs fnm-mt-sm">
                  <div className="fnm-semibold">{byId.get(parentKey)?.displayName ?? parentKey}</div>
                  <div className="fnm-text-sm">
                    {sorted.map((c, idx) => (
                      <span key={c.id}>
                        <a href={`/modality/${c.slug}`}>{c.displayName}</a>
                        {idx < sorted.length - 1 ? " · " : ""}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
        </section>
      ) : null}
    </div>
  );
}


