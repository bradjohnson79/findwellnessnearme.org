import { prisma } from "../../../../src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function GeographyPage() {
  const us = await prisma.country.findUnique({
    where: { iso2: "US" },
    include: {
      states: {
        orderBy: [{ uspsCode: "asc" }],
        include: { _count: { select: { cities: true } } }
      }
    }
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Geography (US)</h2>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Read-only view. Use seed scripts to add canonical states/cities.
      </div>

      {!us ? (
        <div>No US country record found. Run `pnpm seed:geography`.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Country: {us.name} ({us.iso2}) — slug: {us.slug} — id: {us.id}
          </div>

          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Code</th>
                <th>Name</th>
                <th>Slug</th>
                <th>Cities (seeded)</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {us.states.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{s.uspsCode}</td>
                  <td>{s.name}</td>
                  <td style={{ fontSize: 12 }}>{s.slug}</td>
                  <td>{s._count.cities}</td>
                  <td style={{ fontSize: 12 }}>{s.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}


