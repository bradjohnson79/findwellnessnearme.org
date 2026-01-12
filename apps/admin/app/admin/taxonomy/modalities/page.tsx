import { prisma } from "../../../../src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ModalitiesPage() {
  const modalities = await prisma.modality.findMany({
    orderBy: [{ displayName: "asc" }]
  });

  const parentById = new Map(modalities.map((m) => [m.id, m]));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Modalities (taxonomy)</h2>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Read-only view. Seed scripts are the primary mutation path in Phase 4A.
      </div>

      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Display name</th>
            <th>Slug</th>
            <th>Parent</th>
            <th>Active</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          {modalities.map((m) => (
            <tr key={m.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td>{m.displayName}</td>
              <td style={{ fontSize: 12 }}>{m.slug}</td>
              <td style={{ fontSize: 12 }}>
                {m.parentId ? parentById.get(m.parentId)?.displayName ?? m.parentId : "—"}
              </td>
              <td>{m.isActive ? "true" : "false"}</td>
              <td style={{ fontSize: 12 }}>{m.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


