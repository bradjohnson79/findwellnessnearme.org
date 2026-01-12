-- Add optional lat/lng coordinates for ListingLocation (Phase 9.5 map support)
ALTER TABLE "ListingLocation"
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;

-- Optional: basic query support (future)
CREATE INDEX IF NOT EXISTS "ListingLocation_lat_lng_idx"
ON "ListingLocation" ("latitude", "longitude");


