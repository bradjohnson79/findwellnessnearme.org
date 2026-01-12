export default function SystemIndexPage() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>System</h2>
      <div style={{ fontSize: 12, opacity: 0.8 }}>Operational pages (read-only).</div>
      <ul>
        <li>
          <a href="/admin/system/scheduler">Scheduler</a>
        </li>
        <li>
          <a href="/admin/system/ai-reviews">AI reviews</a>
        </li>
      </ul>
    </div>
  );
}


