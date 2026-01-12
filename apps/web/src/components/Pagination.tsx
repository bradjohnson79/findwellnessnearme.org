type Props = {
  page: number;
  pageSize: number;
  total: number;
  makeHref: (page: number) => string;
};

function buildPageItems(page: number, totalPages: number) {
  const items: Array<number | "…"> = [];
  const windowSize = 2; // pages around current
  const first = 1;
  const last = totalPages;

  const start = Math.max(first, page - windowSize);
  const end = Math.min(last, page + windowSize);

  items.push(first);
  if (start > first + 1) items.push("…");
  for (let p = start; p <= end; p++) {
    if (p !== first && p !== last) items.push(p);
  }
  if (end < last - 1) items.push("…");
  if (last !== first) items.push(last);

  return items;
}

export function Pagination({ page, pageSize, total, makeHref }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;
  const items = buildPageItems(page, totalPages);

  return (
    <nav className="fnm-row fnm-text-sm" aria-label="Pagination">
      {prev ? <a href={makeHref(prev)}>Prev</a> : <span className="fnm-disabled">Prev</span>}
      {items.map((it, idx) => {
        if (it === "…") return <span key={`e-${idx}`}>…</span>;
        const isCurrent = it === page;
        return isCurrent ? (
          <span key={it} aria-current="page" className="fnm-semibold">
            {it}
          </span>
        ) : (
          <a key={it} href={makeHref(it)}>
            {it}
          </a>
        );
      })}
      {next ? <a href={makeHref(next)}>Next</a> : <span className="fnm-disabled">Next</span>}
    </nav>
  );
}


