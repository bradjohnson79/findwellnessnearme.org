import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
        <div style={{ fontWeight: 700 }}>findwellnessnearme admin</div>
        <nav style={{ display: "flex", gap: 12 }}>
          <a href="/admin/listings">Listings</a>
          <a href="/admin/removal-requests">Removal requests</a>
          <a href="/admin/taxonomy/modalities">Taxonomy</a>
          <a href="/admin/taxonomy/geography">Geography</a>
          <a href="/admin/claims">Claims</a>
          <a href="/admin/system">System</a>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}


