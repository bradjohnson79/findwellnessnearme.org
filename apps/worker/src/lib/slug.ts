function slugifyPiece(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

export function buildListingSlug(displayName: string, websiteDomain: string): string {
  const a = slugifyPiece(displayName) || "listing";
  const b = slugifyPiece(websiteDomain.replace(/^www\./, "")) || "site";
  return `${a}-${b}`.slice(0, 80);
}


