import { prisma } from "../../src/lib/prisma";
import { ReferenceFooter } from "../../src/components/ReferenceFooter";

const PREFERRED_MODALITY_SLUGS = [
  "yoga",
  "chiropractic",
  "acupuncture",
  "massage-therapy",
  "holistic-medicine"
] as const;

export default async function FooterDefault() {
  const preferred = await prisma.modality.findMany({
    where: { isActive: true, slug: { in: [...PREFERRED_MODALITY_SLUGS] } },
    select: { id: true, displayName: true, slug: true }
  });

  const preferredBySlug = new Map(preferred.map((m) => [m.slug, m]));
  const preferredOrdered = PREFERRED_MODALITY_SLUGS.map((s) => preferredBySlug.get(s)).filter(
    (x): x is NonNullable<typeof x> => Boolean(x)
  );

  const fallback =
    preferredOrdered.length >= 5
      ? []
      : await prisma.modality.findMany({
          where: { isActive: true },
          select: { id: true, displayName: true, slug: true },
          orderBy: [{ displayName: "asc" }],
          take: 5
        });

  const modalities = preferredOrdered.length ? preferredOrdered : fallback;

  return <ReferenceFooter modalities={modalities} />;
}


