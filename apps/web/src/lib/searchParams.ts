export function firstParam(
  v: string | string[] | undefined
): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export function intParam(v: string | string[] | undefined, fallback: number): number {
  const s = firstParam(v);
  if (!s) return fallback;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}


