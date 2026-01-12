import type { Prisma } from "@prisma/client";

// CRITICAL: Public visibility filter (must be applied to every public query).
export const PUBLIC_LISTING_WHERE: Prisma.ListingWhereInput = {
  moderationStatus: "APPROVED",
  deletedAt: null,
  optedOutAt: null
};


